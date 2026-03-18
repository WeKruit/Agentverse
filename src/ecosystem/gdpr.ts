/**
 * GDPR compliance — data export, VP revocation, right to erasure.
 *
 * Implements:
 * - Article 17: Right to erasure (key revocation + VP revocation notification)
 * - Article 20: Right to data portability (full export)
 * - Article 15: Right of access (profile + audit log)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { readJsonFile, writeJsonFile } from "../wallet/storage.js";
import { readAuditLog } from "../consent/audit.js";

export interface DataExport {
  exported_at: string;
  format_version: "1.0";
  profile: any | null;
  credentials: any[];
  relationships: any[];
  audit_log: any[];
  policies: any[];
  did_document: any | null;
  metadata: {
    total_files: number;
    total_sharing_events: number;
    agents_shared_with: string[];
  };
}

/**
 * Export all user data (GDPR Article 20 — data portability).
 *
 * Produces a single JSON file containing all user data
 * in a structured, machine-readable format.
 */
export function exportAllData(basePath: string): DataExport {
  const exportData: DataExport = {
    exported_at: new Date().toISOString(),
    format_version: "1.0",
    profile: null,
    credentials: [],
    relationships: [],
    audit_log: [],
    policies: [],
    did_document: null,
    metadata: {
      total_files: 0,
      total_sharing_events: 0,
      agents_shared_with: [],
    },
  };

  // Profile
  const profilePath = path.join(basePath, "profile.json");
  if (fs.existsSync(profilePath)) {
    exportData.profile = readJsonFile(profilePath);
    exportData.metadata.total_files++;
  }

  // Credentials
  const credDir = path.join(basePath, "credentials");
  if (fs.existsSync(credDir)) {
    for (const f of fs.readdirSync(credDir).filter((f) => f.endsWith(".json"))) {
      exportData.credentials.push(readJsonFile(path.join(credDir, f)));
      exportData.metadata.total_files++;
    }
  }

  // Relationships
  const relDir = path.join(basePath, "relationships");
  if (fs.existsSync(relDir)) {
    for (const f of fs.readdirSync(relDir).filter((f) => f.endsWith(".json"))) {
      exportData.relationships.push(readJsonFile(path.join(relDir, f)));
      exportData.metadata.total_files++;
    }
  }

  // Audit log
  const logPath = path.join(basePath, "audit", "sharing.log");
  exportData.audit_log = readAuditLog(logPath);
  exportData.metadata.total_sharing_events = exportData.audit_log.length;
  exportData.metadata.agents_shared_with = [
    ...new Set(exportData.audit_log.map((e: any) => e.agent_domain).filter(Boolean)),
  ];

  // Policies
  const policyDir = path.join(basePath, "policies");
  if (fs.existsSync(policyDir)) {
    for (const f of fs.readdirSync(policyDir).filter((f) => f.endsWith(".json"))) {
      exportData.policies.push({
        filename: f,
        ...readJsonFile(path.join(policyDir, f)),
      });
      exportData.metadata.total_files++;
    }
  }

  // DID Document
  const didPath = path.join(basePath, "did", "did.json");
  if (fs.existsSync(didPath)) {
    exportData.did_document = readJsonFile(didPath);
    exportData.metadata.total_files++;
  }

  return exportData;
}

/**
 * Save a data export to a file.
 */
export function saveExport(exportData: DataExport, outputPath: string): void {
  writeJsonFile(outputPath, exportData);
}

/**
 * Revoke a VP by sending a revocation notification to the agent.
 * This is best-effort — the agent may ignore it.
 *
 * The 90-day VC TTL is the ultimate backstop.
 */
export async function revokeVP(
  agentUrl: string,
  vpHash: string,
  reason: string = "user-requested"
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [
              {
                type: "data",
                data: {
                  type: "vp_revocation",
                  vp_hash: vpHash,
                  reason,
                  timestamp: new Date().toISOString(),
                },
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { success: true, message: "Revocation notification sent" };
    }
    return { success: false, message: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Erase all local data (GDPR Article 17 — right to erasure).
 *
 * Deletes everything in ~/.agentverse/ except the audit log
 * (which is retained for legal compliance but can be separately purged).
 *
 * WARNING: This is destructive and irreversible. All keys, credentials,
 * profiles, and relationships will be permanently deleted.
 */
export function eraseAllData(
  basePath: string,
  keepAuditLog: boolean = true
): { deleted: string[]; kept: string[] } {
  const deleted: string[] = [];
  const kept: string[] = [];

  if (!fs.existsSync(basePath)) {
    return { deleted, kept };
  }

  const dirsToDelete = [
    "keys", "credentials", "agents", "venues",
    "matches", "relationships", "cache", "did", "policies",
  ];

  for (const dir of dirsToDelete) {
    const dirPath = path.join(basePath, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      deleted.push(dir);
    }
  }

  // Delete profile
  const profilePath = path.join(basePath, "profile.json");
  if (fs.existsSync(profilePath)) {
    fs.unlinkSync(profilePath);
    deleted.push("profile.json");
  }

  // Audit log
  const auditDir = path.join(basePath, "audit");
  if (keepAuditLog && fs.existsSync(auditDir)) {
    kept.push("audit/ (retained for compliance)");
  } else if (fs.existsSync(auditDir)) {
    fs.rmSync(auditDir, { recursive: true, force: true });
    deleted.push("audit/");
  }

  return { deleted, kept };
}
