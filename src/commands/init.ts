import { Command } from "commander";
import { resolve } from "node:path";
import { homedir } from "node:os";

export const AGENTVERSE_DIR = resolve(homedir(), ".agentverse");

export const initCommand = new Command("init")
  .description("Initialize Agentverse: generate keys and create config")
  .option("--force", "Overwrite existing configuration")
  .action(async (options) => {
    console.log("Initializing Agentverse...");
    // TODO: Generate BLS12-381 key pair
    // TODO: Generate Ed25519 key pair for Agent Card signing
    // TODO: Create did:jwk DID Document
    // TODO: Create directory structure at ~/.agentverse/
    // TODO: Create default consent policy
    console.log(`  Config directory: ${AGENTVERSE_DIR}`);
    console.log("  [not yet implemented]");
  });
