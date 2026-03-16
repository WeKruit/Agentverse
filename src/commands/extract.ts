import { Command } from "commander";

export const extractCommand = new Command("extract")
  .description("Extract personal profile from LLM conversation history")
  .option("--source <path>", "Path to conversation export file")
  .option(
    "--format <type>",
    "Source format: claude-code | chatgpt (auto-detected if omitted)"
  )
  .option("--dry-run", "Estimate cost without running extraction")
  .option("--full", "Full re-extraction (ignore previous results)")
  .option("--max-conversations <n>", "Limit number of conversations", parseInt)
  .option("--since <date>", "Only extract conversations after this date")
  .action(async (options) => {
    console.log("Extracting profile from conversation history...");
    // TODO: Auto-detect sources (Claude Code JSONL, ChatGPT JSON)
    // TODO: Parse and normalize conversations
    // TODO: Chunk and sample for LLM extraction
    // TODO: Run LLM extraction with structured output
    // TODO: Aggregate and deduplicate
    // TODO: Present for user review
    console.log("  [not yet implemented]");
  });
