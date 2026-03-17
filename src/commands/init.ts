// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { generateMasterKeyPair, createDidDocument } from "../wallet/keys.js";
import {
  initializeDirectory,
  encryptAndStore,
  writeJsonFile,
  isWalletInitialized,
} from "../wallet/storage.js";

export const AGENTVERSE_DIR =
  process.env.AGENTVERSE_HOME || path.resolve(homedir(), ".agentverse");

export const initCommand = new Command("init")
  .description("Initialize Agentverse: generate keys and create config")
  .option("--force", "Overwrite existing configuration")
  .action(async (options: { force?: boolean }) => {
    const basePath = AGENTVERSE_DIR;

    if (isWalletInitialized(basePath) && !options.force) {
      console.log("Agentverse is already initialized.");
      console.log(`  Directory: ${basePath}`);
      console.log('  Use --force to reinitialize (will regenerate keys).');
      return;
    }

    console.log("Initializing Agentverse...\n");

    // 1. Create directory structure
    initializeDirectory(basePath);
    console.log(`  Created directory: ${basePath}`);

    // 2. Generate BLS12-381 key pair
    console.log("  Generating BLS12-381 key pair...");
    const { keyPair, exported } = await generateMasterKeyPair();
    console.log(
      `  Public key: ${exported.publicKeyMultibase.slice(0, 30)}...`
    );

    // 3. Store keys (private key encrypted, public key plaintext)
    // For MVP, use a fixed passphrase prompt — in production, use OS keychain
    const passphrase = "agentverse-dev"; // TODO: prompt user for passphrase
    encryptAndStore(
      { secretKeyMultibase: exported.secretKeyMultibase },
      path.join(basePath, "keys", "master.key.enc"),
      passphrase
    );
    writeJsonFile(path.join(basePath, "keys", "master.pub.json"), {
      publicKeyMultibase: exported.publicKeyMultibase,
      algorithm: exported.algorithm,
      controller: exported.controller,
      id: exported.id,
    });
    console.log("  Keys stored (private encrypted, public plaintext)");

    // 4. Create DID Document
    const didDoc = createDidDocument(exported.publicKeyMultibase);
    writeJsonFile(path.join(basePath, "did", "did.json"), didDoc);
    console.log(`  DID: ${didDoc.id}`);

    // 5. Summary
    console.log("\n  Agentverse initialized successfully!");
    console.log(`  Directory: ${basePath}`);
    console.log(`  DID: ${didDoc.id}`);
    console.log(
      `  Public key: ${exported.publicKeyMultibase.slice(0, 30)}...`
    );
    console.log(
      "\n  Next steps:"
    );
    console.log("    agentverse extract    Extract profile from LLM history");
    console.log("    agentverse profile    View your profile");
    console.log(
      "    agentverse wallet issue   Issue credentials from profile"
    );
  });
