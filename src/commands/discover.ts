// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile } from "../wallet/storage.js";
import { buildFilesystem } from "../delegate/filesystem.js";
import { generateLocalEmbedding } from "../discovery/embeddings.js";
import type { ExtractedProfile } from "../extractor/types.js";

const DEFAULT_SERVER = "http://localhost:3000";

// Purpose → bucket ID mapping for convenience
const PURPOSE_BUCKETS: Record<string, string> = {
  recruiting: "recruiting-swe",
  cofounder: "cofounder-search",
  dating: "dating-general",
  freelance: "freelance-dev",
};

export const discoverCommand = new Command("discover")
  .description("Submit your profile to a bucket for matching")
  .option("--bucket <id>", "Bucket ID to submit to")
  .option("--list-buckets", "List available buckets")
  .option("--purpose <purpose>", "Purpose: recruiting | cofounder | dating | freelance")
  .option("--server <url>", "Server URL (default: http://localhost:3000)", DEFAULT_SERVER)
  .action(async (options) => {
    const serverUrl = options.server;

    // Check server is running
    try {
      const health = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!health.ok) throw new Error();
    } catch {
      console.log("\n  Server not running. Start it first:\n");
      console.log("    agentverse serve\n");
      console.log("  Then in another terminal:");
      console.log("    agentverse discover --purpose recruiting\n");
      return;
    }

    // List buckets
    if (options.listBuckets) {
      const res = await fetch(`${serverUrl}/api/buckets`);
      const data = await res.json();

      console.log(`\n  Available Buckets (${data.buckets.length}):\n`);
      for (const b of data.buckets) {
        console.log(`    ${b.id}`);
        console.log(`      Category: ${b.category}`);
        console.log(`      Fields: ${b.schema_fields.join(", ")}`);
        console.log(`      Agents: ${b.agent_count}`);
        console.log();
      }
      return;
    }

    if (!options.bucket && !options.purpose) {
      console.log("\n  Submit your profile to a matching bucket.\n");
      console.log("  Usage:");
      console.log("    agentverse discover --purpose recruiting");
      console.log("    agentverse discover --purpose cofounder");
      console.log("    agentverse discover --purpose dating");
      console.log("    agentverse discover --purpose freelance");
      console.log("    agentverse discover --list-buckets");
      console.log(`\n  Server: ${serverUrl}`);
      return;
    }

    // Load profile
    const profilePath = path.join(AGENTVERSE_DIR, "profile.json");
    if (!fs.existsSync(profilePath)) {
      console.log("\n  No profile found. Run these first:\n");
      console.log("    agentverse init");
      console.log("    agentverse extract --source <path>\n");
      return;
    }

    const profile = readJsonFile<ExtractedProfile>(profilePath);
    const purpose = options.purpose || "recruiting";
    const bucketId = options.bucket || PURPOSE_BUCKETS[purpose] || `${purpose}-swe`;

    // Build filesystem for this purpose
    const pubKeyPath = path.join(AGENTVERSE_DIR, "keys", "master.pub.json");
    const ownerDid = fs.existsSync(pubKeyPath)
      ? readJsonFile(pubKeyPath).controller
      : `did:key:user-${Date.now()}`;

    const filesystem = buildFilesystem(profile, purpose, ownerDid);

    // Generate embedding for similarity search
    const embedding = generateLocalEmbedding(filesystem.structured);

    console.log(`\n  Submitting to: ${bucketId}`);
    console.log(`  Purpose: ${purpose}`);
    console.log(`  Fields: ${Object.keys(filesystem.structured).join(", ")}`);

    // Submit to server
    try {
      const submitRes = await fetch(`${serverUrl}/api/buckets/${bucketId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filesystem, embedding }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.json();
        console.error(`\n  Error: ${err.error}`);
        return;
      }

      const { listing } = await submitRes.json();
      console.log(`  Listing: ${listing.id}`);
      console.log(`  Expires: ${listing.expires_at}`);

      // Run matching
      console.log("\n  Searching for matches...");
      const matchRes = await fetch(`${serverUrl}/api/buckets/${bucketId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listing.id }),
      });

      const matchData = await matchRes.json();

      if (matchData.matches.length === 0) {
        console.log("  No matches yet. Waiting for other agents to join the bucket.");
        console.log("\n  Your profile is now discoverable. When others submit,");
        console.log("  they'll be matched against you automatically.");
        console.log("\n  Check later: agentverse match");
      } else {
        console.log(`  Found ${matchData.matches.length} match(es)!\n`);
        for (const m of matchData.matches) {
          console.log(`    ${m.signal.toUpperCase()} match`);
          console.log(`      Matched on: ${m.matched_on.join(", ")}`);
          if (m.gaps.length > 0) {
            console.log(`      Gaps: ${m.gaps.join(", ")}`);
          }
          console.log();
        }
        console.log("  View proposals: agentverse match");
      }
    } catch (err: any) {
      console.error(`\n  Error: ${err.message}`);
      console.log("  Is the server running? agentverse serve");
    }
  });
