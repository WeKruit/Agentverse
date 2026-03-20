/**
 * LLM-powered delegate creation.
 *
 * An LLM reads the main agent's FULL filesystem (including human_only),
 * understands the purpose, and creates a purpose-scoped delegate by
 * writing files that are appropriate for that context.
 *
 * The LLM has tools to:
 * - Read any file in the main agent's filesystem (including human_only)
 * - List files in any directory
 * - Write files to the delegate's structured/ and evaluable/ directories
 * - Signal completion
 *
 * The LLM CANNOT write to human_only/ in the delegate — that tier
 * simply doesn't exist for delegates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────

export interface DistillConfig {
  agentId: string;
  purpose: string;
  baseDir: string;
  apiKey: string;
  /** Optional instructions from the user about what to include/exclude */
  userGuidance?: string;
  /** Callback for streaming progress */
  onProgress?: (event: DistillEvent) => void;
}

export interface DistillEvent {
  type: "thinking" | "tool_call" | "tool_result" | "file_written" | "complete" | "error";
  content: string;
  detail?: any;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

// ─── Tools for the Distillation LLM ──────────────────────

function buildTools(): ToolDefinition[] {
  return [
    {
      name: "list_agent_files",
      description: "List files and directories in the main agent's filesystem. Use this to explore what data is available. You can list the root to see all tiers (structured/, evaluable/, human_only/), or drill into a specific directory.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path from the agent root. Use '.' for the root directory, 'structured' for structured files, 'evaluable' for evaluable text, 'human_only' for private notes.",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "read_agent_file",
      description: "Read the contents of a file in the main agent's filesystem. You can read any file including human_only files — you need full context to create a good delegate. The human_only data helps you understand the person but should NOT be copied to the delegate.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file, e.g. 'structured/skills.json' or 'evaluable/about.txt' or 'human_only/notes.txt'",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_delegate_file",
      description: "Write a file to the delegate's filesystem. You can write to structured/ (JSON files with enum-like values) or evaluable/ (text files with descriptions). You CANNOT write to human_only/ — delegates never have private data. Write structured files as valid JSON. Write evaluable files as plain text.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path in the delegate, e.g. 'structured/skills.json' or 'evaluable/about.txt'",
          },
          content: {
            type: "string",
            description: "The file content to write. For structured/ files, this should be valid JSON. For evaluable/ files, this should be plain text.",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "finish_delegate",
      description: "Call this when you are done creating the delegate. Provide a brief summary of what you included and excluded.",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief summary of what was included in the delegate and what was intentionally excluded.",
          },
          files_written: {
            type: "number",
            description: "Number of files written to the delegate.",
          },
        },
        required: ["summary", "files_written"],
      },
    },
  ];
}

// ─── Tool Execution ──────────────────────────────────────

function executeToolCall(
  toolName: string,
  toolInput: Record<string, any>,
  agentDir: string,
  delegateDir: string,
  onProgress?: (event: DistillEvent) => void
): string {
  switch (toolName) {
    case "list_agent_files": {
      const targetPath = path.resolve(agentDir, toolInput.path || ".");
      // Security: ensure we stay within agentDir
      if (!targetPath.startsWith(fs.realpathSync(agentDir))) {
        return JSON.stringify({ error: "Access denied: path outside agent directory" });
      }
      if (!fs.existsSync(targetPath)) {
        return JSON.stringify({ error: `Directory not found: ${toolInput.path}` });
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return JSON.stringify({ error: `Not a directory: ${toolInput.path}` });
      }
      const entries = fs.readdirSync(targetPath).map((name) => {
        const full = path.join(targetPath, name);
        const s = fs.statSync(full);
        return {
          name,
          type: s.isDirectory() ? "directory" : "file",
          size: s.isFile() ? s.size : undefined,
        };
      });
      return JSON.stringify(entries, null, 2);
    }

    case "read_agent_file": {
      const targetPath = path.resolve(agentDir, toolInput.path);
      if (!targetPath.startsWith(fs.realpathSync(agentDir))) {
        return JSON.stringify({ error: "Access denied: path outside agent directory" });
      }
      if (!fs.existsSync(targetPath)) {
        return JSON.stringify({ error: `File not found: ${toolInput.path}` });
      }
      return fs.readFileSync(targetPath, "utf-8");
    }

    case "write_delegate_file": {
      const relPath = toolInput.path as string;
      // Security: prevent writing to human_only/
      if (relPath.startsWith("human_only")) {
        return JSON.stringify({ error: "Access denied: delegates cannot have human_only files. Write to structured/ or evaluable/ only." });
      }
      // Security: only allow structured/ and evaluable/
      if (!relPath.startsWith("structured/") && !relPath.startsWith("evaluable/")) {
        return JSON.stringify({ error: "Access denied: write to structured/ or evaluable/ only." });
      }

      const targetPath = path.resolve(delegateDir, relPath);
      if (!targetPath.startsWith(fs.realpathSync(delegateDir))) {
        return JSON.stringify({ error: "Access denied: path traversal detected" });
      }

      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, toolInput.content);

      onProgress?.({
        type: "file_written",
        content: `Wrote ${relPath} (${toolInput.content.length} bytes)`,
        detail: { path: relPath, size: toolInput.content.length },
      });

      return JSON.stringify({ success: true, path: relPath, size: toolInput.content.length });
    }

    case "finish_delegate": {
      onProgress?.({
        type: "complete",
        content: toolInput.summary,
        detail: { files_written: toolInput.files_written },
      });
      return JSON.stringify({ success: true });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Main Distillation Function ──────────────────────────

export async function distillDelegate(config: DistillConfig): Promise<{
  delegateDir: string;
  summary: string;
  filesWritten: number;
  toolCalls: number;
}> {
  const { agentId, purpose, baseDir, apiKey, userGuidance, onProgress } = config;

  const agentDir = path.join(baseDir, "agents", agentId);
  if (!fs.existsSync(agentDir)) {
    throw new Error(`Main agent not found: ${agentId}`);
  }

  // Create delegate directory
  const delegateDir = path.join(agentDir, "delegates", purpose);
  fs.mkdirSync(path.join(delegateDir, "structured"), { recursive: true });
  fs.mkdirSync(path.join(delegateDir, "evaluable"), { recursive: true });

  // Read main agent metadata for context
  const metaPath = path.join(agentDir, "metadata.json");
  const mainMeta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
    : { name: agentId };

  const systemPrompt = `You are creating a purpose-scoped delegate for an agent named "${mainMeta.name}".

PURPOSE: ${purpose}

Your job is to read the main agent's full filesystem and create a delegate that contains ONLY the information relevant to "${purpose}". The delegate will be shared with other agents for matching — so include what helps find good matches and exclude what's irrelevant or too private for this purpose.

RULES:
1. Start by listing the root directory to see what's available, then read the key files.
2. Read human_only/ files for context — they help you understand the person — but NEVER write human_only content to the delegate.
3. Write structured/ files as JSON (arrays, objects, or simple values). These should contain enum-like values from fixed vocabularies when possible (e.g., skill names, experience bands like "1-3yr", "5-10yr").
4. Write evaluable/ files as plain text. These are free-text descriptions that will be read by an LLM scorer. Write them to be informative for the specific purpose — don't just copy the original, REWRITE for relevance.
5. Be selective. A recruiting delegate doesn't need hobbies. A dating delegate doesn't need technical skills. A cofounder delegate needs both skills AND values.
6. When rewriting evaluable text, focus on what matters for ${purpose}. Drop irrelevant details. Keep it concise but informative.
7. Call finish_delegate when done.

${userGuidance ? `\nUSER GUIDANCE: ${userGuidance}` : ""}`;

  const tools = buildTools();
  let messages: any[] = [{ role: "user", content: "Please create the delegate. Start by exploring the main agent's filesystem." }];
  let totalToolCalls = 0;
  let summary = "";
  let filesWritten = 0;

  onProgress?.({ type: "thinking", content: `Creating ${purpose} delegate for ${mainMeta.name}...` });

  // Tool-use loop
  for (let turn = 0; turn < 20; turn++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data: any = await response.json();

    // Process response content
    const assistantContent = data.content || [];
    messages.push({ role: "assistant", content: assistantContent });

    // Stream text blocks
    for (const block of assistantContent) {
      if (block.type === "text" && block.text) {
        onProgress?.({ type: "thinking", content: block.text });
      }
    }

    // Process tool calls
    const toolUseBlocks = assistantContent.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) break; // No more tool calls — done

    const toolResults: any[] = [];
    for (const toolUse of toolUseBlocks) {
      totalToolCalls++;
      onProgress?.({
        type: "tool_call",
        content: `${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 100)})`,
        detail: { tool: toolUse.name, input: toolUse.input },
      });

      const result = executeToolCall(toolUse.name, toolUse.input, agentDir, delegateDir, onProgress);

      if (toolUse.name === "finish_delegate") {
        summary = toolUse.input.summary || "";
        filesWritten = toolUse.input.files_written || 0;
      }

      if (toolUse.name === "write_delegate_file" && !result.includes("error")) {
        filesWritten++;
      }

      onProgress?.({
        type: "tool_result",
        content: result.slice(0, 200),
        detail: { tool: toolUse.name },
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });

    // Check if finish was called
    if (toolUseBlocks.some((b: any) => b.name === "finish_delegate")) break;
  }

  // Write delegate metadata
  const delegateMeta = {
    id: `delegate-${purpose}-${crypto.randomUUID().slice(0, 8)}`,
    purpose,
    parent_agent_id: agentId,
    parent_agent_name: mainMeta.name,
    did: `${mainMeta.did || "did:key:" + agentId}:delegate:${purpose}`,
    created_at: new Date().toISOString(),
    created_by: "llm-distillation",
    summary,
    tool_calls: totalToolCalls,
  };
  fs.writeFileSync(path.join(delegateDir, "metadata.json"), JSON.stringify(delegateMeta, null, 2));

  // Generate README
  const readmeLines = [
    `# ${mainMeta.name} — ${purpose} delegate`,
    "",
    `**Purpose:** ${purpose}`,
    `**Parent:** ${mainMeta.name} (${agentId})`,
    `**Created by:** LLM distillation (${totalToolCalls} tool calls)`,
    `**Created at:** ${delegateMeta.created_at}`,
    "",
    `## Summary`,
    summary || "(no summary)",
    "",
    "This delegate was created by an LLM that read the main agent's full filesystem",
    "and selected/rewrote content appropriate for this purpose.",
    "The delegate never contains human_only data from the parent.",
  ];
  fs.writeFileSync(path.join(delegateDir, "README.md"), readmeLines.join("\n"));

  return { delegateDir, summary, filesWritten, toolCalls: totalToolCalls };
}

/**
 * Distill with SSE streaming for the dashboard.
 */
export function distillDelegateSSE(
  config: Omit<DistillConfig, "onProgress">,
  res: any // Express response object
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: DistillEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  distillDelegate({ ...config, onProgress: send })
    .then((result) => {
      send({ type: "complete", content: result.summary, detail: result });
      res.end();
    })
    .catch((err) => {
      send({ type: "error", content: err.message });
      res.end();
    });
}
