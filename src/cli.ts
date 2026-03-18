#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { extractCommand } from "./commands/extract.js";
import { profileCommand } from "./commands/profile.js";
import { shareCommand } from "./commands/share.js";
import { auditCommand } from "./commands/audit.js";
import { walletCommand } from "./commands/wallet.js";
import { keysCommand } from "./commands/keys.js";
import { discoverCommand } from "./commands/discover.js";
import { matchCommand } from "./commands/match.js";

const program = new Command();

program
  .name("agentverse")
  .description(
    "Privacy-preserving personal profile sharing between AI agents"
  )
  .version("0.1.0");

// Phase 1: Core CLI
program.addCommand(initCommand);
program.addCommand(extractCommand);
program.addCommand(profileCommand);
program.addCommand(shareCommand);
program.addCommand(auditCommand);
program.addCommand(walletCommand);
program.addCommand(keysCommand);

// Phase 3: Discovery
program.addCommand(discoverCommand);
program.addCommand(matchCommand);

// Phase 2+ stubs
program
  .command("contacts")
  .description("[Phase 2] Manage relationship records")
  .action(() => {
    console.log("\n  Coming in Phase 2 — relationship management.");
  });

program
  .command("persona")
  .description("[Phase 2] Create anonymous personas for venues")
  .action(() => {
    console.log("\n  Coming in Phase 2 — anonymous persona creation.");
  });

program.parse();
