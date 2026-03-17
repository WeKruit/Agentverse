// @ts-nocheck
/**
 * Key management for Agentverse wallet.
 * Handles BLS12-381 key generation, encryption, and DID creation.
 */

import * as crypto from "node:crypto";
import * as Bls12381Multikey from "@digitalbazaar/bls12-381-multikey";

const ALGORITHM = "aes-256-gcm";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface KeyPairExport {
  publicKeyMultibase: string;
  secretKeyMultibase: string;
  controller: string;
  id: string;
  algorithm: string;
}

export interface EncryptedData {
  ciphertext: string; // base64
  salt: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/**
 * Generate a BLS12-381 key pair for BBS+ signing.
 */
export async function generateMasterKeyPair(): Promise<{
  keyPair: any;
  exported: KeyPairExport;
}> {
  const keyPair = await Bls12381Multikey.generateBbsKeyPair({
    algorithm: "BBS-BLS12-381-SHA-256",
  });

  const did = `did:key:${keyPair.publicKeyMultibase}`;
  keyPair.controller = did;
  keyPair.id = `${did}#${keyPair.publicKeyMultibase}`;

  const exported: KeyPairExport = {
    publicKeyMultibase: keyPair.publicKeyMultibase,
    secretKeyMultibase: keyPair.secretKeyMultibase,
    controller: keyPair.controller,
    id: keyPair.id,
    algorithm: "BBS-BLS12-381-SHA-256",
  };

  return { keyPair, exported };
}

/**
 * Reconstruct a key pair from exported data.
 */
export async function importKeyPair(exported: KeyPairExport): Promise<any> {
  const keyPair = await Bls12381Multikey.from({
    publicKeyMultibase: exported.publicKeyMultibase,
    secretKeyMultibase: exported.secretKeyMultibase,
  });
  keyPair.controller = exported.controller;
  keyPair.id = exported.id;
  return keyPair;
}

/**
 * Encrypt data with AES-256-GCM using a passphrase (scrypt KDF).
 */
export function encryptData(
  plaintext: string,
  passphrase: string
): EncryptedData {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  return {
    ciphertext,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt data encrypted with encryptData.
 */
export function decryptData(
  encrypted: EncryptedData,
  passphrase: string
): string {
  const salt = Buffer.from(encrypted.salt, "base64");
  const key = crypto.scryptSync(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const iv = Buffer.from(encrypted.iv, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  let plaintext = decipher.update(encrypted.ciphertext, "base64", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

/**
 * Create a did:jwk DID Document from a public key.
 */
export function createDidDocument(publicKeyMultibase: string) {
  const did = `did:key:${publicKeyMultibase}`;
  const keyId = `${did}#${publicKeyMultibase}`;

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: "Multikey",
        controller: did,
        publicKeyMultibase,
      },
    ],
    assertionMethod: [keyId],
    authentication: [keyId],
  };
}
