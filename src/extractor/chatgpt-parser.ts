/**
 * Parser for ChatGPT conversation export (JSON format).
 *
 * ChatGPT exports conversations as a JSON file (conversations.json)
 * with a DAG structure using UUID-keyed `mapping` nodes.
 */

import * as fs from "node:fs";
import type { NormalizedConversation, NormalizedMessage } from "./types.js";

interface ChatGPTMessage {
  id: string;
  author: { role: string };
  content: { content_type: string; parts?: string[] };
  create_time?: number;
  update_time?: number;
}

interface ChatGPTNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTNode>;
  id?: string;
}

/**
 * Parse a ChatGPT conversations.json export file.
 */
export async function parseChatGPTFile(
  filePath: string
): Promise<NormalizedConversation[]> {
  const raw = fs.readFileSync(filePath, "utf-8");
  let data: ChatGPTConversation[];

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse ChatGPT export at ${filePath}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(
      `ChatGPT export must be a JSON array, got ${typeof data}`
    );
  }

  const conversations: NormalizedConversation[] = [];

  for (const conv of data) {
    if (!conv.mapping) continue;

    // Detect cycles
    if (hasCycles(conv.mapping)) {
      console.warn(
        `  [chatgpt-parser] Skipping conversation "${conv.title}" (cycle detected in DAG)`
      );
      continue;
    }

    const messages = extractMessages(conv.mapping);
    if (messages.length === 0) continue;

    messages.sort((a, b) => a.timestamp - b.timestamp);

    conversations.push({
      id: conv.id || conv.title || `chatgpt-${conv.create_time}`,
      messages,
      source: "chatgpt",
      startTime: messages[0].timestamp,
      endTime: messages[messages.length - 1].timestamp,
    });
  }

  return conversations;
}

/**
 * Extract messages from a ChatGPT mapping DAG.
 */
function extractMessages(
  mapping: Record<string, ChatGPTNode>
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  const visited = new Set<string>();

  // Find root nodes (nodes with no parent or parent not in mapping)
  const roots = Object.values(mapping).filter(
    (node) => !node.parent || !mapping[node.parent]
  );

  function walk(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = mapping[nodeId];
    if (!node) return;

    if (node.message) {
      const role = node.message.author?.role;
      if (role === "user" || role === "assistant") {
        const content = extractContent(node.message);
        if (content) {
          messages.push({
            role: role as "user" | "assistant",
            content,
            timestamp: (node.message.create_time || 0) * 1000,
            source: "chatgpt",
            metadata: {
              conversationId: nodeId,
            },
          });
        }
      }
    }

    // Walk all children (handles forks from message edits)
    for (const childId of node.children || []) {
      walk(childId);
    }
  }

  for (const root of roots) {
    walk(root.id);
  }

  return messages;
}

/**
 * Extract text content from a ChatGPT message.
 */
function extractContent(message: ChatGPTMessage): string | null {
  if (!message.content?.parts) return null;

  const textParts = message.content.parts.filter(
    (part) => typeof part === "string" && part.trim().length > 0
  );

  return textParts.length > 0 ? textParts.join("\n") : null;
}

/**
 * Detect cycles in a ChatGPT mapping DAG.
 */
function hasCycles(mapping: Record<string, ChatGPTNode>): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true; // Cycle detected
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const node = mapping[nodeId];
    if (node?.children) {
      for (const childId of node.children) {
        if (dfs(childId)) return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(mapping)) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) return true;
    }
  }

  return false;
}
