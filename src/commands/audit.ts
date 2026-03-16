import { Command } from "commander";

export const auditCommand = new Command("audit")
  .description("View sharing audit log")
  .option("--agent <domain>", "Filter by agent domain")
  .option("--since <date>", "Show entries after this date")
  .option("--format <fmt>", "Output format: table | json", "table")
  .action(async (options) => {
    console.log("Sharing audit log:");
    // TODO: Read audit log JSONL
    // TODO: Apply filters
    // TODO: Display formatted
    console.log("  [not yet implemented]");
  });
