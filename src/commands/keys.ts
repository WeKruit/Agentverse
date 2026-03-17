import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile } from "../wallet/storage.js";
import type { KeyPairExport } from "../wallet/keys.js";

export const keysCommand = new Command("keys")
  .description("Manage cryptographic keys")
  .addCommand(
    new Command("show")
      .description("Show public key and DID")
      .action(async () => {
        const pubKeyPath = path.join(
          AGENTVERSE_DIR,
          "keys",
          "master.pub.json"
        );
        const didPath = path.join(AGENTVERSE_DIR, "did", "did.json");

        if (!fs.existsSync(pubKeyPath)) {
          console.log("No keys found. Run 'agentverse init' first.");
          return;
        }

        const pubKey = readJsonFile<KeyPairExport>(pubKeyPath);
        console.log("\n  Your Identity\n");
        console.log(`  DID: ${pubKey.controller}`);
        console.log(`  Public key: ${pubKey.publicKeyMultibase}`);
        console.log(`  Algorithm: ${pubKey.algorithm}`);

        if (fs.existsSync(didPath)) {
          const didDoc = readJsonFile(didPath);
          console.log(`  DID Document: ${didPath}`);
          console.log(
            `  Verification methods: ${didDoc.verificationMethod?.length || 0}`
          );
        }
      })
  )
  .addCommand(
    new Command("export")
      .description("Export public key")
      .option("--format <fmt>", "Format: json | multibase", "json")
      .action(async (options) => {
        const pubKeyPath = path.join(
          AGENTVERSE_DIR,
          "keys",
          "master.pub.json"
        );

        if (!fs.existsSync(pubKeyPath)) {
          console.log("No keys found. Run 'agentverse init' first.");
          return;
        }

        const pubKey = readJsonFile<KeyPairExport>(pubKeyPath);

        if (options.format === "multibase") {
          console.log(pubKey.publicKeyMultibase);
        } else {
          console.log(JSON.stringify(pubKey, null, 2));
        }
      })
  )
  .addCommand(
    new Command("revoke")
      .description(
        "Revoke current keys and re-issue credentials (DESTRUCTIVE)"
      )
      .action(async () => {
        console.log(
          "\n  WARNING: This will invalidate ALL existing credentials."
        );
        console.log("  Any VPs previously shared will become unverifiable.");
        console.log(
          "\n  This feature requires interactive confirmation."
        );
        console.log("  [not yet implemented — planned for Phase 1.5]");
      })
  );
