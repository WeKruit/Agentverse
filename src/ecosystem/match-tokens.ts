/**
 * Match tokens — cryptographic receipts for completed matches.
 *
 * When both parties accept a match, a token is generated that proves
 * the match happened without revealing the participants' identities.
 *
 * Production: Pedersen commitment-based, Tessera-anchored.
 * Locally: SHA-256 hash-based with file storage.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeJsonFile, readJsonFile } from "../wallet/storage.js";

export interface MatchToken {
  id: string;
  bucket_id: string;
  // Commitment: hash of the participants, not the raw DIDs
  commitment: string; // SHA-256(listing_a_did + listing_b_did + nonce)
  signal: string;
  matched_on: string[];
  timestamp: string;
  nonce: string;
  // Each party gets a proof they can use to verify the match happened
  proof_a: string; // SHA-256(commitment + listing_a_did)
  proof_b: string; // SHA-256(commitment + listing_b_did)
}

/**
 * Generate a match token for a completed mutual match.
 */
export function generateMatchToken(
  bucketId: string,
  listingADid: string,
  listingBDid: string,
  signal: string,
  matchedOn: string[]
): MatchToken {
  const nonce = crypto.randomBytes(32).toString("hex");
  const id = `token-${crypto.randomUUID().slice(0, 8)}`;

  // Commitment hides participant identities
  const commitment = crypto
    .createHash("sha256")
    .update(`${listingADid}:${listingBDid}:${nonce}`)
    .digest("hex");

  // Individual proofs — each party can verify they participated
  const proof_a = crypto
    .createHash("sha256")
    .update(`${commitment}:${listingADid}`)
    .digest("hex");

  const proof_b = crypto
    .createHash("sha256")
    .update(`${commitment}:${listingBDid}`)
    .digest("hex");

  return {
    id,
    bucket_id: bucketId,
    commitment,
    signal,
    matched_on: matchedOn,
    timestamp: new Date().toISOString(),
    nonce,
    proof_a,
    proof_b,
  };
}

/**
 * Verify that a DID participated in a match (using their proof).
 */
export function verifyParticipation(
  token: MatchToken,
  did: string,
  proof: string
): boolean {
  const expectedProof = crypto
    .createHash("sha256")
    .update(`${token.commitment}:${did}`)
    .digest("hex");

  return proof === expectedProof;
}

/**
 * Save match tokens to disk.
 */
export function saveMatchToken(basePath: string, token: MatchToken): string {
  const dir = path.join(basePath, "matches", "receipts");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const filePath = path.join(dir, `${token.id}.json`);
  writeJsonFile(filePath, token);
  return filePath;
}

/**
 * Load all match tokens.
 */
export function loadMatchTokens(basePath: string): MatchToken[] {
  const dir = path.join(basePath, "matches", "receipts");
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try { return readJsonFile<MatchToken>(path.join(dir, f)); }
      catch { return null; }
    })
    .filter((t): t is MatchToken => t !== null);
}
