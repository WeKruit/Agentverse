// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateMasterKeyPair,
  importKeyPair,
  encryptData,
  decryptData,
  createDidDocument,
} from "../src/wallet/keys.js";
import {
  initializeDirectory,
  encryptAndStore,
  readAndDecrypt,
  writeJsonFile,
  readJsonFile,
  isWalletInitialized,
} from "../src/wallet/storage.js";
import { issueCredential, verifyCredential } from "../src/wallet/credentials.js";
import {
  generatePresentation,
  verifyPresentation,
  PRESETS,
} from "../src/wallet/presentation.js";

const TEST_PASSPHRASE = "test-passphrase-123";
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-test-"));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("Key Management", () => {
  it("generates a BLS12-381 key pair", async () => {
    const { keyPair, exported } = await generateMasterKeyPair();

    expect(exported.publicKeyMultibase).toBeDefined();
    expect(exported.publicKeyMultibase).toMatch(/^zUC7/);
    expect(exported.secretKeyMultibase).toBeDefined();
    expect(exported.controller).toContain("did:key:");
    expect(exported.algorithm).toBe("BBS-BLS12-381-SHA-256");
    expect(keyPair.signer).toBeDefined();
  });

  it("imports a key pair from exported data", async () => {
    const { exported } = await generateMasterKeyPair();
    const imported = await importKeyPair(exported);

    expect(imported.publicKeyMultibase).toBe(exported.publicKeyMultibase);
    expect(imported.signer).toBeDefined();
  });

  it("encrypts and decrypts data", () => {
    const plaintext = '{"secretKey": "super-secret-value"}';
    const encrypted = encryptData(plaintext, TEST_PASSPHRASE);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(plaintext);

    const decrypted = decryptData(encrypted, TEST_PASSPHRASE);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong passphrase", () => {
    const encrypted = encryptData("secret", TEST_PASSPHRASE);
    expect(() => decryptData(encrypted, "wrong-passphrase")).toThrow();
  });

  it("creates a DID Document", async () => {
    const { exported } = await generateMasterKeyPair();
    const didDoc = createDidDocument(exported.publicKeyMultibase);

    expect(didDoc.id).toContain("did:key:");
    expect(didDoc.verificationMethod).toHaveLength(1);
    expect(didDoc.verificationMethod[0].type).toBe("Multikey");
    expect(didDoc.verificationMethod[0].publicKeyMultibase).toBe(
      exported.publicKeyMultibase
    );
    expect(didDoc.assertionMethod).toHaveLength(1);
  });
});

describe("Storage", () => {
  it("initializes directory structure", () => {
    initializeDirectory(testDir);

    expect(fs.existsSync(path.join(testDir, "keys"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "credentials"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "policies"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "audit"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "did"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "agents"))).toBe(true);

    // Default policy should exist
    const policy = readJsonFile(
      path.join(testDir, "policies", "_default.json")
    );
    expect(policy.default_action).toBe("deny");
  });

  it("encrypts and decrypts stored data", () => {
    const data = { name: "test", value: 42 };
    const filePath = path.join(testDir, "test.enc");

    encryptAndStore(data, filePath, TEST_PASSPHRASE);
    expect(fs.existsSync(filePath)).toBe(true);

    const recovered = readAndDecrypt(filePath, TEST_PASSPHRASE);
    expect(recovered).toEqual(data);
  });

  it("detects initialized wallet", async () => {
    expect(isWalletInitialized(testDir)).toBe(false);

    initializeDirectory(testDir);
    // Still false — no DID document yet
    expect(isWalletInitialized(testDir)).toBe(false);

    writeJsonFile(path.join(testDir, "did", "did.json"), { id: "test" });
    expect(isWalletInitialized(testDir)).toBe(true);
  });
});

describe("Credential Issuance", () => {
  it("issues and verifies a BBS+ credential", async () => {
    const { keyPair } = await generateMasterKeyPair();

    const claims = {
      skills: ["rust", "typescript"],
      experienceBand: "5-10yr",
      values: ["autonomy"],
    };

    const signedVC = await issueCredential(claims, keyPair);

    expect(signedVC.type).toContain("VerifiableCredential");
    expect(signedVC.type).toContain("AgentverseCredential");
    expect(signedVC.proof).toBeDefined();
    expect(signedVC.proof.type).toBe("DataIntegrityProof");
    expect(signedVC.proof.cryptosuite).toBe("bbs-2023");
    expect(signedVC.credentialSubject.skills).toEqual(["rust", "typescript"]);

    const result = await verifyCredential(signedVC, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);
});

describe("Selective Disclosure", () => {
  it("derives a proof revealing only selected claims", async () => {
    const { keyPair } = await generateMasterKeyPair();

    const claims = {
      skills: ["rust", "typescript", "python"],
      experienceBand: "5-10yr",
      experienceYears: 7,
      values: ["autonomy", "impact"],
      locationRegion: "US-West",
      availability: "full-time",
      lookingFor: "biz-cofounder",
      domain: "fintech",
      about: "Built payment systems at scale.",
      projectHighlights: ["payment-pipeline"],
    };

    const signedVC = await issueCredential(claims, keyPair);

    // Derive proof revealing only 3 claims
    const derivedVC = await generatePresentation(
      signedVC,
      ["skills", "experienceBand", "lookingFor"],
      keyPair
    );

    // Check disclosed fields
    const subject = derivedVC.credentialSubject;
    expect(subject.skills).toEqual(["rust", "typescript", "python"]);
    expect(subject.experienceBand).toBe("5-10yr");
    expect(subject.lookingFor).toBe("biz-cofounder");

    // Check hidden fields are absent
    expect(subject.experienceYears).toBeUndefined();
    expect(subject.values).toBeUndefined();
    expect(subject.locationRegion).toBeUndefined();
    expect(subject.availability).toBeUndefined();
    expect(subject.domain).toBeUndefined();
    expect(subject.about).toBeUndefined();
    expect(subject.projectHighlights).toBeUndefined();

    // Verify the derived proof
    const result = await verifyPresentation(derivedVC, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);

  it("works with preset 'minimal'", async () => {
    const { keyPair } = await generateMasterKeyPair();
    const claims = {
      skills: ["rust"],
      experienceBand: "5-10yr",
      values: ["autonomy"],
    };

    const signedVC = await issueCredential(claims, keyPair);
    const derivedVC = await generatePresentation(signedVC, "minimal", keyPair);

    expect(derivedVC.credentialSubject.skills).toEqual(["rust"]);
    expect(derivedVC.credentialSubject.experienceBand).toBeUndefined();

    const result = await verifyPresentation(derivedVC, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);

  it("works with preset 'professional'", async () => {
    const { keyPair } = await generateMasterKeyPair();
    const claims = {
      skills: ["rust"],
      experienceBand: "5-10yr",
      values: ["autonomy"],
      availability: "full-time",
      lookingFor: "cofounder",
      about: "Hidden text",
    };

    const signedVC = await issueCredential(claims, keyPair);
    const derivedVC = await generatePresentation(
      signedVC,
      "professional",
      keyPair
    );

    expect(derivedVC.credentialSubject.skills).toBeDefined();
    expect(derivedVC.credentialSubject.experienceBand).toBeDefined();
    expect(derivedVC.credentialSubject.values).toBeDefined();
    expect(derivedVC.credentialSubject.about).toBeUndefined();

    const result = await verifyPresentation(derivedVC, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);
});
