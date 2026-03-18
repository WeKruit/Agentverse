// @ts-nocheck
import { Command } from "commander";

const DEFAULT_SERVER = "http://localhost:3000";

export const matchCommand = new Command("match")
  .description("View and respond to match proposals")
  .option("--accept <id>", "Accept a match proposal")
  .option("--decline <id>", "Decline a match proposal")
  .option("--server <url>", "Server URL", DEFAULT_SERVER)
  .action(async (options) => {
    const serverUrl = options.server;

    // Check server is running
    try {
      await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
    } catch {
      console.log("\n  Server not running. Start it first:\n");
      console.log("    agentverse serve\n");
      return;
    }

    if (options.accept) {
      const res = await fetch(`${serverUrl}/api/proposals/${options.accept}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`\n  Accepted match: ${data.proposal.id}`);
        console.log("  Waiting for the other party...");
      } else {
        console.log(`\n  Could not accept: proposal not found or already resolved.`);
      }
      return;
    }

    if (options.decline) {
      const res = await fetch(`${serverUrl}/api/proposals/${options.decline}/decline`, {
        method: "POST",
      });
      if (res.ok) {
        console.log(`\n  Declined match: ${options.decline}`);
      } else {
        console.log(`\n  Could not decline: proposal not found or already resolved.`);
      }
      return;
    }

    // List pending proposals
    const res = await fetch(`${serverUrl}/api/proposals`);
    const data = await res.json();

    if (data.proposals.length === 0) {
      console.log("\n  No pending match proposals.");
      console.log("  Submit to a bucket first:\n");
      console.log("    agentverse discover --purpose recruiting\n");
      return;
    }

    console.log(`\n  Pending Matches (${data.proposals.length}):\n`);

    for (const p of data.proposals) {
      console.log(`  ${p.id}`);
      console.log(`    Signal: ${p.signal.toUpperCase()}`);
      console.log(`    Bucket: ${p.bucket_id}`);
      if (p.matched_on.length > 0) {
        console.log(`    Matched: ${p.matched_on.join(", ")}`);
      }
      if (p.gaps.length > 0) {
        console.log(`    Gaps: ${p.gaps.join(", ")}`);
      }

      // Show peer's structured data
      const peerFields = Object.entries(p.peer_structured)
        .filter(([k]) => !k.startsWith("min_") && !k.startsWith("max_"))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join(" | ");
      if (peerFields) {
        console.log(`    Peer: ${peerFields}`);
      }

      console.log(`    Expires: ${p.expires_at}`);
      console.log();
    }

    console.log("  Respond:");
    console.log("    agentverse match --accept <id>");
    console.log("    agentverse match --decline <id>\n");
  });
