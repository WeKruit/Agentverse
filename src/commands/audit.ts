import { Command } from "commander";
import * as path from "node:path";
import { AGENTVERSE_DIR } from "./init.js";
import { readAuditLog, verifyAuditChain } from "../consent/audit.js";

export const auditCommand = new Command("audit")
  .description("View sharing audit log")
  .option("--agent <domain>", "Filter by agent domain")
  .option("--since <date>", "Show entries after this date")
  .option("--verify", "Verify hash chain integrity")
  .option("--json", "Output raw JSON")
  .action(async (options) => {
    const logPath = path.join(AGENTVERSE_DIR, "audit", "sharing.log");

    if (options.verify) {
      const result = verifyAuditChain(logPath);
      if (result.valid) {
        console.log(`\n  Audit chain: VALID (${result.entries} entries)`);
      } else {
        console.log(`\n  Audit chain: BROKEN at entry ${result.brokenAt}`);
        console.log("  The log may have been tampered with.");
      }
      return;
    }

    const entries = readAuditLog(logPath, {
      agent_domain: options.agent,
      since: options.since,
    });

    if (entries.length === 0) {
      console.log("\n  No audit entries found.");
      if (!options.agent && !options.since) {
        console.log("  Share with an agent first: agentverse share --with <domain>");
      }
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    console.log(`\n  Sharing Audit Log (${entries.length} entries)\n`);

    for (const entry of entries) {
      const status =
        entry.status === "shared"
          ? "SHARED"
          : entry.status === "denied"
            ? "DENIED"
            : "ERROR";
      console.log(
        `  #${entry.seq}  ${entry.timestamp}  ${status}  ${entry.agent_domain}`
      );
      if (entry.attributes_disclosed.length > 0) {
        console.log(
          `       Attributes: ${entry.attributes_disclosed.join(", ")}`
        );
      }
      if (entry.purpose) {
        console.log(`       Purpose: ${entry.purpose}`);
      }
      if (entry.vp_hash) {
        console.log(`       VP hash: ${entry.vp_hash}`);
      }
      console.log();
    }
  });
