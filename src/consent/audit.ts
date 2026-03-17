/**
 * Audit logger — hash-chained append-only JSONL log.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface AuditEntry {
  seq: number;
  timestamp: string;
  agent_domain: string;
  agent_did?: string;
  purpose?: string;
  attributes_disclosed: string[];
  status: "shared" | "denied" | "error";
  vp_hash?: string;
  prev_hash: string;
  hash: string;
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute SHA-256 hash of an audit entry (excluding the hash field itself).
 */
function computeHash(entry: Omit<AuditEntry, "hash">): string {
  const data = JSON.stringify(entry);
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Append a sharing event to the audit log.
 */
export function logSharingEvent(
  logPath: string,
  event: {
    agent_domain: string;
    agent_did?: string;
    purpose?: string;
    attributes_disclosed: string[];
    status: "shared" | "denied" | "error";
    vp_hash?: string;
  }
): AuditEntry {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Read last entry to get prev_hash and seq
  let prevHash = GENESIS_HASH;
  let seq = 0;

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, "utf-8").trim();
    if (content) {
      const lines = content.split("\n");
      const lastLine = lines[lines.length - 1];
      try {
        const lastEntry: AuditEntry = JSON.parse(lastLine);
        prevHash = lastEntry.hash;
        seq = lastEntry.seq + 1;
      } catch {
        // Corrupted log — start fresh chain but don't overwrite
        seq = 0;
        prevHash = GENESIS_HASH;
      }
    }
  }

  const entryWithoutHash = {
    seq,
    timestamp: new Date().toISOString(),
    agent_domain: event.agent_domain,
    agent_did: event.agent_did,
    purpose: event.purpose,
    attributes_disclosed: event.attributes_disclosed,
    status: event.status,
    vp_hash: event.vp_hash,
    prev_hash: prevHash,
  };

  const hash = computeHash(entryWithoutHash);
  const entry: AuditEntry = { ...entryWithoutHash, hash };

  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", {
    mode: 0o600,
  });

  return entry;
}

/**
 * Read audit log entries, optionally filtering.
 */
export function readAuditLog(
  logPath: string,
  filters?: { agent_domain?: string; since?: string }
): AuditEntry[] {
  if (!fs.existsSync(logPath)) return [];

  const content = fs.readFileSync(logPath, "utf-8").trim();
  if (!content) return [];

  let entries: AuditEntry[] = content
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEntry => e !== null);

  if (filters?.agent_domain) {
    entries = entries.filter((e) => e.agent_domain === filters.agent_domain);
  }

  if (filters?.since) {
    const sinceDate = new Date(filters.since).getTime();
    entries = entries.filter(
      (e) => new Date(e.timestamp).getTime() >= sinceDate
    );
  }

  return entries;
}

/**
 * Verify the hash chain integrity of the audit log.
 */
export function verifyAuditChain(logPath: string): {
  valid: boolean;
  entries: number;
  brokenAt?: number;
} {
  const entries = readAuditLog(logPath);
  if (entries.length === 0) return { valid: true, entries: 0 };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check prev_hash
    if (i === 0) {
      if (entry.prev_hash !== GENESIS_HASH) {
        return { valid: false, entries: entries.length, brokenAt: i };
      }
    } else {
      if (entry.prev_hash !== entries[i - 1].hash) {
        return { valid: false, entries: entries.length, brokenAt: i };
      }
    }

    // Check hash
    const { hash, ...rest } = entry;
    const expectedHash = computeHash(rest);
    if (hash !== expectedHash) {
      return { valid: false, entries: entries.length, brokenAt: i };
    }
  }

  return { valid: true, entries: entries.length };
}
