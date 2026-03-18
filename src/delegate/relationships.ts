/**
 * Relationship records — structured persistence for ongoing connections.
 *
 * When a delegate interaction results in a match, a relationship record
 * is created. Future delegates for the same peer are spawned with context
 * from the relationship record (NOT from raw conversation data).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { readJsonFile, writeJsonFile } from "../wallet/storage.js";
import type { RelationshipRecord } from "./types.js";

/**
 * Save or update a relationship record.
 */
export function saveRelationship(
  basePath: string,
  record: RelationshipRecord
): string {
  const relDir = path.join(basePath, "relationships");
  if (!fs.existsSync(relDir)) {
    fs.mkdirSync(relDir, { recursive: true, mode: 0o700 });
  }

  const hash = crypto
    .createHash("sha256")
    .update(record.peer_did)
    .digest("hex")
    .slice(0, 16);
  const filePath = path.join(relDir, `${hash}.json`);

  writeJsonFile(filePath, record);
  return filePath;
}

/**
 * Load a relationship record by peer DID.
 */
export function loadRelationship(
  basePath: string,
  peerDid: string
): RelationshipRecord | null {
  const hash = crypto
    .createHash("sha256")
    .update(peerDid)
    .digest("hex")
    .slice(0, 16);
  const filePath = path.join(basePath, "relationships", `${hash}.json`);

  if (!fs.existsSync(filePath)) return null;

  try {
    return readJsonFile<RelationshipRecord>(filePath);
  } catch {
    return null;
  }
}

/**
 * List all relationship records.
 */
export function listRelationships(basePath: string): RelationshipRecord[] {
  const relDir = path.join(basePath, "relationships");
  if (!fs.existsSync(relDir)) return [];

  return fs
    .readdirSync(relDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return readJsonFile<RelationshipRecord>(path.join(relDir, f));
      } catch {
        return null;
      }
    })
    .filter((r): r is RelationshipRecord => r !== null);
}

/**
 * Update a relationship after an interaction.
 */
export function recordInteraction(
  basePath: string,
  peerDid: string,
  topics: string[]
): RelationshipRecord | null {
  const record = loadRelationship(basePath, peerDid);
  if (!record) return null;

  record.interactions += 1;
  record.last_interaction = new Date().toISOString();

  // Merge topics (deduplicate)
  const topicSet = new Set([...record.topics_discussed, ...topics]);
  record.topics_discussed = Array.from(topicSet);

  saveRelationship(basePath, record);
  return record;
}

/**
 * End a relationship.
 */
export function endRelationship(
  basePath: string,
  peerDid: string
): boolean {
  const record = loadRelationship(basePath, peerDid);
  if (!record) return false;

  record.status = "ended";
  record.last_interaction = new Date().toISOString();
  saveRelationship(basePath, record);
  return true;
}

/**
 * Create a new relationship from a successful delegate match.
 */
export function createRelationshipFromMatch(
  basePath: string,
  peerDid: string,
  peerName: string | undefined,
  purpose: string,
  sharedAttributes: string[]
): RelationshipRecord {
  const record: RelationshipRecord = {
    peer_did: peerDid,
    peer_name: peerName,
    purpose,
    status: "active",
    preset: sharedAttributes,
    interactions: 1,
    topics_discussed: [],
    trust_level: "known",
    created_at: new Date().toISOString(),
    last_interaction: new Date().toISOString(),
  };

  saveRelationship(basePath, record);
  return record;
}
