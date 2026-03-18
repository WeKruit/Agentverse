// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile } from "../wallet/storage.js";
import { startLocalServer } from "../local-server/api.js";

export const serveCommand = new Command("serve")
  .description("Start local Agentverse server (Agent Card + API + matching)")
  .option("--port <port>", "Port to listen on", "3000")
  .option("--open-to <purposes>", "Comma-separated purposes to accept", "recruiting,collaboration,cofounder")
  .action(async (options) => {
    const basePath = AGENTVERSE_DIR;
    const pubKeyPath = path.join(basePath, "keys", "master.pub.json");

    let did = "did:key:local-dev";
    let name = "Agentverse Local";

    if (fs.existsSync(pubKeyPath)) {
      const pubKey = readJsonFile(pubKeyPath);
      did = pubKey.controller;
      name = "Agentverse Local Agent";
    }

    const openTo = options.openTo.split(",").map((s: string) => s.trim());
    const port = parseInt(options.port, 10);

    console.log("\nStarting Agentverse local server...\n");

    const instance = await startLocalServer({
      name,
      did,
      open_to: openTo,
      port,
    });

    console.log(`  Dashboard: ${instance.url}`);
    console.log(`  Agent Card: ${instance.url}/.well-known/agent.json`);
    console.log(`  Health: ${instance.url}/health`);
    console.log(`  DID: ${did}`);
    console.log(`  Open to: ${openTo.join(", ")}`);
    console.log(`  Mode: local (simulated TEE)`);
    console.log("\n  API Endpoints:");
    console.log(`    GET  /api/buckets              List buckets`);
    console.log(`    POST /api/buckets/:id/submit   Submit agent`);
    console.log(`    POST /api/buckets/:id/match    Run matching`);
    console.log(`    GET  /api/proposals             List proposals`);
    console.log(`    POST /api/proposals/:id/accept  Accept match`);
    console.log(`    POST /api/proposals/:id/decline Decline match`);
    console.log("\n  Press Ctrl+C to stop.\n");

    // Keep alive
    process.on("SIGINT", async () => {
      console.log("\n  Shutting down...");
      await instance.close();
      process.exit(0);
    });
  });
