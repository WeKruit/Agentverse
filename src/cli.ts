#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { extractCommand } from "./commands/extract.js";
import { profileCommand } from "./commands/profile.js";
import { shareCommand } from "./commands/share.js";
import { auditCommand } from "./commands/audit.js";
import { walletCommand } from "./commands/wallet.js";
import { keysCommand } from "./commands/keys.js";

const program = new Command();

program
  .name("agentverse")
  .description(
    "Privacy-preserving personal profile sharing between AI agents"
  )
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(extractCommand);
program.addCommand(profileCommand);
program.addCommand(shareCommand);
program.addCommand(auditCommand);
program.addCommand(walletCommand);
program.addCommand(keysCommand);

// Phase 3 stubs
program
  .command("discover")
  .description("[Phase 3 stub] Find matching agents via EACP protocol")
  .action(() => {
    console.log(
      "\n  Coming in Phase 3 — encrypted agent discovery via the EACP protocol."
    );
    console.log(
      "  See: encrypted-agent-commons-whitepaper.md for details.\n"
    );
  });

program
  .command("match")
  .description("[Phase 3 stub] View and respond to match proposals")
  .action(() => {
    console.log(
      "\n  Coming in Phase 3 — match proposals via EACP TEE clean rooms."
    );
    console.log(
      "  See: encrypted-agent-commons-whitepaper.md for details.\n"
    );
  });

program.parse();
