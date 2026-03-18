// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile } from "../wallet/storage.js";
import { buildFilesystem } from "../delegate/filesystem.js";
import { createLocalVenue } from "../discovery/venue.js";
import { listBuckets } from "../discovery/bucket-registry.js";
import type { ExtractedProfile } from "../extractor/types.js";

export const discoverCommand = new Command("discover")
  .description("Submit your profile to a bucket for matching")
  .option("--bucket <id>", "Bucket ID to submit to")
  .option("--list-buckets", "List available buckets")
  .option("--purpose <purpose>", "Purpose: recruiting | cofounder | dating | freelance")
  .action(async (options) => {
    if (options.listBuckets) {
      const venue = createLocalVenue();
      const buckets = venue.listBuckets();

      console.log(`\n  Available Buckets (${buckets.length}):\n`);
      for (const b of buckets) {
        console.log(`    ${b.id}`);
        console.log(`      Category: ${b.category}`);
        console.log(`      Fields: ${b.schema_fields.join(", ")}`);
        console.log(`      Agents: ${b.agent_count}`);
        console.log();
      }
      return;
    }

    if (!options.bucket && !options.purpose) {
      console.log("Usage:");
      console.log("  agentverse discover --list-buckets");
      console.log("  agentverse discover --bucket <id>");
      console.log("  agentverse discover --purpose recruiting");
      return;
    }

    // Load profile
    const profilePath = path.join(AGENTVERSE_DIR, "profile.json");
    if (!fs.existsSync(profilePath)) {
      console.log("No profile found. Run 'agentverse extract' first.");
      return;
    }

    const profile = readJsonFile<ExtractedProfile>(profilePath);
    const purpose = options.purpose || "recruiting";
    const bucketId = options.bucket || `${purpose}-swe`;

    // Build filesystem for this purpose
    const pubKeyPath = path.join(AGENTVERSE_DIR, "keys", "master.pub.json");
    const ownerDid = fs.existsSync(pubKeyPath)
      ? readJsonFile(pubKeyPath).controller
      : "did:key:anonymous";

    const filesystem = buildFilesystem(profile, purpose, ownerDid);

    console.log(`\nSubmitting to bucket: ${bucketId}`);
    console.log(`  Purpose: ${purpose}`);
    console.log(`  Fields: ${Object.keys(filesystem.structured).join(", ")}`);

    // Submit to local venue
    const venue = createLocalVenue();
    try {
      const listing = venue.submit(bucketId, filesystem);
      console.log(`  Listing ID: ${listing.id}`);
      console.log(`  Expires: ${listing.expires_at}`);

      // Run matching
      console.log("\nSearching for matches...");
      const matches = venue.match(bucketId, listing.id);

      if (matches.length === 0) {
        console.log("  No matches found yet. Other agents need to be in the bucket.");
        console.log("  Run 'agentverse match' later to check for new matches.");
      } else {
        console.log(`  Found ${matches.length} match(es):\n`);
        for (const m of matches) {
          console.log(`    ${m.signal.toUpperCase()} — Score: ${(m.score * 100).toFixed(0)}%`);
          console.log(`      Matched: ${m.matched_on.join(", ")}`);
          if (m.gaps.length > 0) {
            console.log(`      Gaps: ${m.gaps.join(", ")}`);
          }
          console.log();
        }
      }

      console.log("  Next: agentverse match    View and respond to proposals");
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
    }
  });
