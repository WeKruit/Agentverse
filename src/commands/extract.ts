// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { parseClaudeCodeFile, findClaudeCodeFiles } from "../extractor/claude-code-parser.js";
import { parseChatGPTFile } from "../extractor/chatgpt-parser.js";
import { extractProfile } from "../extractor/pipeline.js";
import { encryptAndStore, writeJsonFile, isWalletInitialized } from "../wallet/storage.js";
import type { NormalizedConversation } from "../extractor/types.js";

export const extractCommand = new Command("extract")
  .description("Extract personal profile from LLM conversation history")
  .option("--source <path>", "Path to conversation export file")
  .option("--format <type>", "Source format: claude-code | chatgpt (auto-detected if omitted)")
  .option("--dry-run", "Show detected sources without running extraction")
  .action(async (options) => {
    const basePath = AGENTVERSE_DIR;
    const allConversations: NormalizedConversation[] = [];

    // Auto-detect sources
    const sources: { path: string; format: string }[] = [];

    if (options.source) {
      const format = options.format || detectFormat(options.source);
      sources.push({ path: options.source, format });
    } else {
      // Scan for Claude Code files
      const claudeFiles = findClaudeCodeFiles();
      for (const f of claudeFiles) {
        sources.push({ path: f, format: "claude-code" });
      }

      // Check common ChatGPT export locations
      const chatgptPaths = [
        path.join(process.env.HOME || "", "Downloads", "conversations.json"),
        path.join(process.env.HOME || "", "Downloads", "chatgpt-export", "conversations.json"),
      ];
      for (const p of chatgptPaths) {
        if (fs.existsSync(p)) {
          sources.push({ path: p, format: "chatgpt" });
        }
      }
    }

    if (sources.length === 0) {
      console.log("No conversation sources found.");
      console.log("\n  To extract from a specific file:");
      console.log("    agentverse extract --source <path>");
      console.log("\n  Supported formats:");
      console.log("    - Claude Code: ~/.claude/projects/*/sessions/*.jsonl");
      console.log("    - ChatGPT: conversations.json from data export");
      return;
    }

    console.log(`Detected ${sources.length} source(s):\n`);
    for (const s of sources) {
      console.log(`  ${s.format}: ${s.path}`);
    }

    if (options.dryRun) {
      console.log("\n  (dry run — no extraction performed)");
      return;
    }

    console.log("\nExtracting profile...\n");

    // Parse all sources
    for (const source of sources) {
      try {
        if (source.format === "claude-code") {
          const convs = await parseClaudeCodeFile(source.path);
          allConversations.push(...convs);
          console.log(`  Parsed ${convs.length} conversations from Claude Code`);
        } else if (source.format === "chatgpt") {
          const convs = await parseChatGPTFile(source.path);
          allConversations.push(...convs);
          console.log(`  Parsed ${convs.length} conversations from ChatGPT`);
        }
      } catch (err: any) {
        console.error(`  Error parsing ${source.path}: ${err.message}`);
      }
    }

    if (allConversations.length === 0) {
      console.log("\n  No conversations found in sources.");
      return;
    }

    // Run extraction pipeline
    const profile = extractProfile(allConversations);

    console.log(`\n  Extracted ${profile.skills.length} skills`);
    console.log(`  Extracted ${profile.interests.length} interests`);
    console.log(`  From ${profile.metadata.conversationCount} conversations`);

    // Save profile
    const profilePath = path.join(basePath, "profile.json");
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true, mode: 0o700 });
    }
    writeJsonFile(profilePath, profile);
    console.log(`\n  Profile saved to ${profilePath}`);

    console.log("\n  Next steps:");
    console.log("    agentverse profile           View your profile");
    console.log("    agentverse wallet issue       Issue credentials");
  });

function detectFormat(filePath: string): string {
  if (filePath.endsWith(".jsonl")) return "claude-code";
  if (filePath.endsWith(".json")) return "chatgpt";
  return "claude-code"; // default
}
