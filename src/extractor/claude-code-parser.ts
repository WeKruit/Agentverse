/**
 * Parser for Claude Code conversation history (JSONL format).
 *
 * Claude Code stores conversations as JSONL files at:
 *   ~/.claude/projects/<hash>/sessions/*.jsonl
 *   ~/.claude/history.jsonl
 */

import * as fs from "node:fs";
import * as readline from "node:readline";
import type { NormalizedConversation, NormalizedMessage } from "./types.js";

interface ClaudeCodeEntry {
  uuid: string;
  parentUuid?: string;
  type: string; // "user" | "assistant" | "summary"
  message?: {
    role?: string;
    content?: string | { type: string; text?: string }[];
  };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
}

/**
 * Parse a Claude Code JSONL file into normalized conversations.
 */
export async function parseClaudeCodeFile(
  filePath: string
): Promise<NormalizedConversation[]> {
  const entries: ClaudeCodeEntry[] = [];
  let malformedCount = 0;

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as ClaudeCodeEntry;
      if (entry.uuid) {
        entries.push(entry);
      }
    } catch {
      malformedCount++;
    }
  }

  if (malformedCount > 0) {
    console.warn(
      `  [claude-code-parser] Skipped ${malformedCount} malformed lines in ${filePath}`
    );
  }

  return groupIntoConversations(entries);
}

/**
 * Group entries by session and reconstruct thread DAGs.
 */
function groupIntoConversations(
  entries: ClaudeCodeEntry[]
): NormalizedConversation[] {
  // Group by sessionId
  const sessions = new Map<string, ClaudeCodeEntry[]>();
  for (const entry of entries) {
    const sessionId = entry.sessionId || "unknown";
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    sessions.get(sessionId)!.push(entry);
  }

  const conversations: NormalizedConversation[] = [];

  for (const [sessionId, sessionEntries] of sessions) {
    // Build parent→children map for DAG reconstruction
    const byUuid = new Map<string, ClaudeCodeEntry>();
    const roots: ClaudeCodeEntry[] = [];

    for (const entry of sessionEntries) {
      byUuid.set(entry.uuid, entry);
      if (!entry.parentUuid || !byUuid.has(entry.parentUuid)) {
        roots.push(entry);
      }
    }

    // Walk the DAG from roots, collecting messages in order
    const messages: NormalizedMessage[] = [];
    const visited = new Set<string>();

    function walk(entry: ClaudeCodeEntry) {
      if (visited.has(entry.uuid)) return;
      visited.add(entry.uuid);

      const content = extractContent(entry);
      if (content && (entry.type === "user" || entry.type === "assistant")) {
        messages.push({
          role: entry.type as "user" | "assistant",
          content,
          timestamp: entry.timestamp
            ? new Date(entry.timestamp).getTime()
            : Date.now(),
          source: "claude-code",
          metadata: {
            sessionId,
            cwd: entry.cwd,
            gitBranch: entry.gitBranch,
          },
        });
      }

      // Find children
      for (const child of sessionEntries) {
        if (child.parentUuid === entry.uuid && !visited.has(child.uuid)) {
          walk(child);
        }
      }
    }

    for (const root of roots) {
      walk(root);
    }

    if (messages.length > 0) {
      // Sort by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);

      conversations.push({
        id: sessionId,
        messages,
        source: "claude-code",
        startTime: messages[0].timestamp,
        endTime: messages[messages.length - 1].timestamp,
      });
    }
  }

  return conversations;
}

/**
 * Extract text content from a Claude Code entry.
 */
function extractContent(entry: ClaudeCodeEntry): string | null {
  if (!entry.message) return null;

  if (typeof entry.message.content === "string") {
    return entry.message.content;
  }

  if (Array.isArray(entry.message.content)) {
    return entry.message.content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n");
  }

  return null;
}

/**
 * Scan for Claude Code JSONL files in the default location.
 */
export function findClaudeCodeFiles(
  claudeDir?: string
): string[] {
  const dir = claudeDir || `${process.env.HOME}/.claude`;
  const files: string[] = [];

  if (!fs.existsSync(dir)) return files;

  // Check history.jsonl
  const historyFile = `${dir}/history.jsonl`;
  if (fs.existsSync(historyFile)) {
    files.push(historyFile);
  }

  // Check projects/*/sessions/*.jsonl
  const projectsDir = `${dir}/projects`;
  if (fs.existsSync(projectsDir)) {
    try {
      for (const project of fs.readdirSync(projectsDir)) {
        const sessionsDir = `${projectsDir}/${project}/sessions`;
        if (fs.existsSync(sessionsDir)) {
          for (const file of fs.readdirSync(sessionsDir)) {
            if (file.endsWith(".jsonl")) {
              files.push(`${sessionsDir}/${file}`);
            }
          }
        }
      }
    } catch {
      // Permission errors, etc.
    }
  }

  return files;
}
