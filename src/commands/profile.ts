import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile } from "../wallet/storage.js";
import type { ExtractedProfile } from "../extractor/types.js";

export const profileCommand = new Command("profile")
  .description("View and manage your extracted profile")
  .option("--json", "Output raw JSON")
  .action(async (options) => {
    const profilePath = path.join(AGENTVERSE_DIR, "profile.json");

    if (!fs.existsSync(profilePath)) {
      console.log("No profile found. Run 'agentverse extract' first.");
      return;
    }

    const profile = readJsonFile<ExtractedProfile>(profilePath);

    if (options.json) {
      console.log(JSON.stringify(profile, null, 2));
      return;
    }

    // Formatted display
    console.log("\n  Your Agentverse Profile\n");

    // Skills
    if (profile.skills.length > 0) {
      console.log("  Skills:");
      for (const skill of profile.skills.slice(0, 20)) {
        const bar = renderBar(skill.confidence);
        console.log(`    ${skill.name.padEnd(20)} ${bar}  ${skill.confidence.toFixed(2)}  (${skill.mentions} mentions)`);
      }
    }

    // Interests
    if (profile.interests.length > 0) {
      console.log("\n  Interests:");
      for (const interest of profile.interests) {
        console.log(`    ${interest.topic} (${interest.mentions} mentions)`);
      }
    }

    // Communication
    console.log("\n  Communication Style:");
    console.log(`    Verbosity: ${profile.communication.verbosity}`);
    console.log(`    Formality: ${profile.communication.formality}`);
    console.log(`    Technical depth: ${profile.communication.technicalDepth}`);

    // Career
    console.log("\n  Career:");
    console.log(`    Stage: ${profile.career.careerStage}`);
    if (profile.career.currentRole) {
      console.log(`    Role: ${profile.career.currentRole}`);
    }
    if (profile.career.industry) {
      console.log(`    Industry: ${profile.career.industry}`);
    }

    // Metadata
    console.log("\n  Metadata:");
    console.log(`    Extracted: ${profile.metadata.extractedAt}`);
    console.log(`    Conversations: ${profile.metadata.conversationCount}`);
    for (const [source, count] of Object.entries(profile.metadata.sourceBreakdown)) {
      console.log(`    ${source}: ${count}`);
    }

    console.log("\n  Next steps:");
    console.log("    agentverse wallet issue    Issue credentials from this profile");
    console.log("    agentverse profile --json  Export raw JSON");
  });

function renderBar(confidence: number): string {
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}
