import { Command } from "commander";

export const shareCommand = new Command("share")
  .description("Share profile attributes with a third-party agent")
  .requiredOption("--with <domain>", "Target agent domain (e.g., ditto.ai)")
  .option("--purpose <purpose>", "Purpose for sharing (e.g., dating-profile)")
  .option(
    "--preset <name>",
    "Disclosure preset: minimal | professional | full",
    "minimal"
  )
  .option(
    "--attributes <list>",
    "Comma-separated attribute names to share (overrides preset)"
  )
  .option("--force", "Skip consent prompt")
  .action(async (options) => {
    console.log(`Sharing with ${options.with}...`);
    // TODO: Fetch and verify Agent Card
    // TODO: Resolve DID Document
    // TODO: Evaluate consent (interactive prompt or policy)
    // TODO: Load only approved credentials from wallet
    // TODO: Generate BBS+ derived proof (selective disclosure)
    // TODO: Assemble VP
    // TODO: Send via A2A SendMessage
    // TODO: Handle task response
    // TODO: Write audit log entry
    console.log("  [not yet implemented]");
  });
