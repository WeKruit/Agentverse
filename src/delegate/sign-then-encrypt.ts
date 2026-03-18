/**
 * Sign-then-encrypt — DIDComm v2 authcrypt pattern.
 *
 * Solves the sender authentication gap:
 * 1. Sign the plaintext with the sender's Ed25519 key (JWS)
 * 2. Encrypt the signed payload with the recipient's X25519 key (ECDH + AES-256-GCM)
 *
 * The recipient decrypts, then verifies the JWS signature to confirm who sent it.
 * This is the Phase 2 E2E encryption that replaces TLS-only from Phase 1.
 *
 * For MVP Phase 2, we use Node.js crypto with ECDH (X25519) + AES-256-GCM.
 * Full DIDComm v2 authcrypt will be added when we integrate OpenMLS.
 */

import * as crypto from "node:crypto";

export interface SignedPayload {
  payload: string; // base64url encoded original data
  signature: string; // base64url encoded Ed25519 signature
  signer_did: string;
  algorithm: "Ed25519";
}

export interface EncryptedEnvelope {
  ciphertext: string; // base64
  ephemeral_public_key: string; // base64 — sender's ephemeral X25519 key
  iv: string; // base64
  auth_tag: string; // base64
  recipient_key_id: string; // DID key reference of intended recipient
  signer_did: string; // who signed the inner payload
}

/**
 * Sign data with Ed25519.
 */
export function signPayload(
  data: string,
  privateKey: crypto.KeyObject,
  signerDid: string
): SignedPayload {
  const payload = Buffer.from(data).toString("base64url");
  const payloadBuffer = Buffer.from(payload, "utf-8");
  const signature = crypto
    .sign(null, payloadBuffer, privateKey)
    .toString("base64url");

  return {
    payload,
    signature,
    signer_did: signerDid,
    algorithm: "Ed25519",
  };
}

/**
 * Verify a signed payload.
 */
export function verifySignedPayload(
  signed: SignedPayload,
  publicKey: crypto.KeyObject
): { valid: boolean; data: string } {
  const payloadBuffer = Buffer.from(signed.payload, "utf-8");
  const signatureBuffer = Buffer.from(signed.signature, "base64url");
  const valid = crypto.verify(null, payloadBuffer, publicKey, signatureBuffer);

  const data = valid
    ? Buffer.from(signed.payload, "base64url").toString("utf-8")
    : "";

  return { valid, data };
}

/**
 * Generate an Ed25519 key pair for signing.
 */
export function generateSigningKeyPair(): {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
} {
  return crypto.generateKeyPairSync("ed25519");
}

/**
 * Generate an X25519 key pair for encryption.
 */
export function generateEncryptionKeyPair(): {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
} {
  return crypto.generateKeyPairSync("x25519");
}

/**
 * Encrypt with ECDH (X25519) + AES-256-GCM.
 *
 * Uses an ephemeral key pair so each message has unique keys (forward secrecy).
 */
export function encryptForRecipient(
  data: string,
  recipientPublicKey: crypto.KeyObject,
  recipientKeyId: string,
  signerDid: string
): EncryptedEnvelope {
  // Generate ephemeral X25519 key pair
  const ephemeral = crypto.generateKeyPairSync("x25519");

  // Derive shared secret via ECDH
  const sharedSecret = crypto.diffieHellman({
    publicKey: recipientPublicKey,
    privateKey: ephemeral.privateKey,
  });

  // Derive encryption key from shared secret using HKDF
  const encKey = crypto.hkdfSync(
    "sha256",
    sharedSecret,
    Buffer.alloc(0), // no salt for simplicity in MVP
    Buffer.from("agentverse-ste-v1"), // info/context
    32 // key length
  );

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(encKey),
    iv
  );

  let ciphertext = cipher.update(data, "utf-8", "base64");
  ciphertext += cipher.final("base64");

  // Export ephemeral public key for recipient
  const ephPubKeyRaw = ephemeral.publicKey.export({
    type: "spki",
    format: "der",
  });

  return {
    ciphertext,
    ephemeral_public_key: Buffer.from(ephPubKeyRaw).toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    recipient_key_id: recipientKeyId,
    signer_did: signerDid,
  };
}

/**
 * Decrypt an encrypted envelope.
 */
export function decryptEnvelope(
  envelope: EncryptedEnvelope,
  recipientPrivateKey: crypto.KeyObject
): string {
  // Import sender's ephemeral public key
  const ephPubKeyDer = Buffer.from(envelope.ephemeral_public_key, "base64");
  const ephPubKey = crypto.createPublicKey({
    key: ephPubKeyDer,
    type: "spki",
    format: "der",
  });

  // Derive shared secret
  const sharedSecret = crypto.diffieHellman({
    publicKey: ephPubKey,
    privateKey: recipientPrivateKey,
  });

  // Derive encryption key
  const encKey = crypto.hkdfSync(
    "sha256",
    sharedSecret,
    Buffer.alloc(0),
    Buffer.from("agentverse-ste-v1"),
    32
  );

  const iv = Buffer.from(envelope.iv, "base64");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(encKey),
    iv
  );
  decipher.setAuthTag(Buffer.from(envelope.auth_tag, "base64"));

  let plaintext = decipher.update(envelope.ciphertext, "base64", "utf-8");
  plaintext += decipher.final("utf-8");

  return plaintext;
}

/**
 * Full sign-then-encrypt flow.
 *
 * 1. Sign the data with sender's Ed25519 key
 * 2. Encrypt the signed payload with recipient's X25519 key
 */
export function signThenEncrypt(
  data: string,
  senderSigningKey: crypto.KeyObject,
  senderDid: string,
  recipientEncryptionKey: crypto.KeyObject,
  recipientKeyId: string
): EncryptedEnvelope {
  // Step 1: Sign
  const signed = signPayload(data, senderSigningKey, senderDid);

  // Step 2: Encrypt the signed payload
  return encryptForRecipient(
    JSON.stringify(signed),
    recipientEncryptionKey,
    recipientKeyId,
    senderDid
  );
}

/**
 * Full decrypt-then-verify flow.
 *
 * 1. Decrypt with recipient's X25519 key
 * 2. Verify the JWS signature with sender's Ed25519 key
 */
export function decryptThenVerify(
  envelope: EncryptedEnvelope,
  recipientPrivateKey: crypto.KeyObject,
  senderPublicKey: crypto.KeyObject
): { valid: boolean; data: string; signer_did: string } {
  // Step 1: Decrypt
  const decrypted = decryptEnvelope(envelope, recipientPrivateKey);
  const signed: SignedPayload = JSON.parse(decrypted);

  // Step 2: Verify signature
  const { valid, data } = verifySignedPayload(signed, senderPublicKey);

  return {
    valid,
    data,
    signer_did: signed.signer_did,
  };
}
