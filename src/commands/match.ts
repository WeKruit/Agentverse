import { Command } from "commander";
import {
  getPendingProposals,
  acceptProposal,
  declineProposal,
  formatMatchProposal,
} from "../discovery/match-protocol.js";

export const matchCommand = new Command("match")
  .description("View and respond to match proposals")
  .option("--accept <id>", "Accept a match proposal")
  .option("--decline <id>", "Decline a match proposal")
  .action(async (options) => {
    if (options.accept) {
      const proposal = acceptProposal(options.accept);
      if (proposal) {
        console.log(`\n  Accepted match: ${proposal.id}`);
        console.log("  Waiting for the other party to accept...");
        console.log("  If mutual, you'll be notified to proceed with identity reveal.");
      } else {
        console.log(`  Match "${options.accept}" not found or already resolved.`);
      }
      return;
    }

    if (options.decline) {
      const success = declineProposal(options.decline);
      if (success) {
        console.log(`\n  Declined match: ${options.decline}`);
      } else {
        console.log(`  Match "${options.decline}" not found or already resolved.`);
      }
      return;
    }

    // List pending proposals
    const proposals = getPendingProposals();

    if (proposals.length === 0) {
      console.log("\n  No pending match proposals.");
      console.log("  Submit to a bucket first: agentverse discover --purpose <purpose>");
      return;
    }

    console.log(`\n  Pending Match Proposals (${proposals.length}):\n`);

    for (const proposal of proposals) {
      console.log(formatMatchProposal(proposal));
    }

    console.log("  To respond:");
    console.log("    agentverse match --accept <id>");
    console.log("    agentverse match --decline <id>");
  });
