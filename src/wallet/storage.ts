/**
 * Encrypted filesystem storage for Agentverse wallet.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { encryptData, decryptData, type EncryptedData } from "./keys.js";

export const DEFAULT_BASE_PATH = path.resolve(homedir(), ".agentverse");

const DIRS = [
  "keys",
  "agents",
  "credentials",
  "venues",
  "matches/active",
  "matches/completed",
  "matches/receipts",
  "policies",
  "cache/agent-cards",
  "cache/did-documents",
  "cache/extraction",
  "audit",
  "relationships",
  "did",
];

/**
 * Initialize the ~/.agentverse/ directory structure.
 */
export function initializeDirectory(basePath: string = DEFAULT_BASE_PATH): void {
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { mode: 0o700, recursive: true });
  }

  for (const dir of DIRS) {
    const dirPath = path.join(basePath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { mode: 0o700, recursive: true });
    }
  }

  // Create default policy file
  const policyPath = path.join(basePath, "policies", "_default.json");
  if (!fs.existsSync(policyPath)) {
    const defaultPolicy = {
      default_action: "deny",
      rules: [],
    };
    writeJsonFile(policyPath, defaultPolicy);
  }
}

/**
 * Encrypt data and write to a file.
 */
export function encryptAndStore(
  data: any,
  filePath: string,
  passphrase: string
): void {
  const plaintext = JSON.stringify(data);
  const encrypted = encryptData(plaintext, passphrase);
  writeJsonFile(filePath, encrypted);
}

/**
 * Read an encrypted file and decrypt it.
 */
export function readAndDecrypt<T = any>(
  filePath: string,
  passphrase: string
): T {
  const encrypted = readJsonFile<EncryptedData>(filePath);
  const plaintext = decryptData(encrypted, passphrase);
  return JSON.parse(plaintext);
}

/**
 * Write a JSON file with 0600 permissions.
 */
export function writeJsonFile(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });
}

/**
 * Read a JSON file.
 */
export function readJsonFile<T = any>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Check if a wallet has been initialized at the given path.
 */
export function isWalletInitialized(
  basePath: string = DEFAULT_BASE_PATH
): boolean {
  return (
    fs.existsSync(path.join(basePath, "keys")) &&
    fs.existsSync(path.join(basePath, "credentials")) &&
    fs.existsSync(path.join(basePath, "did", "did.json"))
  );
}
