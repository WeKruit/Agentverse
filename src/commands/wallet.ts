// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";
import { readJsonFile, writeJsonFile } from "../wallet/storage.js";
import { importKeyPair, type KeyPairExport } from "../wallet/keys.js";
import { issueCredential } from "../wallet/credentials.js";
import type { ExtractedProfile } from "../extractor/types.js";

export const walletCommand = new Command("wallet")
  .description("Manage credential wallet")
  .addCommand(
    new Command("list")
      .description("List all credentials")
      .action(async () => {
        const credDir = path.join(AGENTVERSE_DIR, "credentials");
        if (!fs.existsSync(credDir)) {
          console.log("No credentials found. Run 'agentverse wallet issue' first.");
          return;
        }

        const files = fs.readdirSync(credDir).filter((f) => f.endsWith(".vc.json"));
        if (files.length === 0) {
          console.log("No credentials issued yet.");
          console.log("  Run: agentverse wallet issue");
          return;
        }

        console.log(`\n  Credentials (${files.length}):\n`);
        for (const file of files) {
          const vc = readJsonFile(path.join(credDir, file));
          const claims = Object.keys(vc.credentialSubject || {}).filter(
            (k) => k !== "id"
          );
          console.log(`    ${file}`);
          console.log(`      Type: ${vc.type?.join(", ")}`);
          console.log(`      Claims: ${claims.join(", ")}`);
          console.log(`      Issued: ${vc.issuanceDate}`);
          console.log();
        }
      })
  )
  .addCommand(
    new Command("show")
      .description("Show credential details")
      .argument("<file>", "Credential filename")
      .action(async (file) => {
        const credPath = path.join(AGENTVERSE_DIR, "credentials", file);
        if (!fs.existsSync(credPath)) {
          console.log(`Credential not found: ${file}`);
          return;
        }

        const vc = readJsonFile(credPath);
        console.log(JSON.stringify(vc, null, 2));
      })
  )
  .addCommand(
    new Command("issue")
      .description("Issue BBS+ credentials from extracted profile")
      .action(async () => {
        const profilePath = path.join(AGENTVERSE_DIR, "profile.json");
        const pubKeyPath = path.join(AGENTVERSE_DIR, "keys", "master.pub.json");

        if (!fs.existsSync(profilePath)) {
          console.log("No profile found. Run 'agentverse extract' first.");
          return;
        }
        if (!fs.existsSync(pubKeyPath)) {
          console.log("No keys found. Run 'agentverse init' first.");
          return;
        }

        console.log("Issuing BBS+ credentials from profile...\n");

        const profile = readJsonFile<ExtractedProfile>(profilePath);
        const pubKey = readJsonFile<KeyPairExport>(pubKeyPath);

        // Read encrypted private key
        const encKeyPath = path.join(AGENTVERSE_DIR, "keys", "master.key.enc");
        if (!fs.existsSync(encKeyPath)) {
          console.log("Encrypted private key not found. Run 'agentverse init' first.");
          return;
        }
        const { readAndDecrypt } = await import("../wallet/storage.js");
        const passphrase = "agentverse-dev"; // TODO: prompt for passphrase
        const secretData = readAndDecrypt(encKeyPath, passphrase);

        const keyPairExport: KeyPairExport = {
          publicKeyMultibase: pubKey.publicKeyMultibase,
          secretKeyMultibase: secretData.secretKeyMultibase,
          controller: pubKey.controller,
          id: pubKey.id,
          algorithm: pubKey.algorithm,
        };

        const keyPair = await importKeyPair(keyPairExport);

        const credDir = path.join(AGENTVERSE_DIR, "credentials");
        if (!fs.existsSync(credDir)) {
          fs.mkdirSync(credDir, { recursive: true, mode: 0o700 });
        }

        // Issue credentials per category
        const categories = buildCategories(profile);
        let issued = 0;

        for (const [name, claims] of Object.entries(categories)) {
          if (Object.keys(claims).length === 0) continue;

          try {
            const signedVC = await issueCredential(claims, keyPair);
            const filename = `${name}.vc.json`;
            writeJsonFile(path.join(credDir, filename), signedVC);
            console.log(`  Issued: ${filename} (${Object.keys(claims).length} claims)`);
            issued++;
          } catch (err: any) {
            console.error(`  Failed to issue ${name}: ${err.message}`);
          }
        }

        console.log(`\n  ${issued} credential(s) issued.`);
        console.log(`  Stored in: ${credDir}`);
        console.log("\n  Next steps:");
        console.log("    agentverse wallet list       View credentials");
        console.log("    agentverse share --with <domain>   Share with an agent");
      })
  );

function buildCategories(profile: ExtractedProfile): Record<string, Record<string, any>> {
  const categories: Record<string, Record<string, any>> = {};

  // Skills credential
  if (profile.skills.length > 0) {
    categories.skills = {
      skills: profile.skills.map((s) => s.name),
      experienceBand: inferExperienceBand(profile.skills),
    };
  }

  // Interests credential
  if (profile.interests.length > 0) {
    categories.interests = {
      interests: profile.interests.map((i) => i.topic),
    };
  }

  // Communication credential
  categories.communication = {
    communicationStyle: `${profile.communication.verbosity}-${profile.communication.formality}`,
  };

  // Values credential
  if (profile.values.length > 0) {
    categories.values = {
      workValues: profile.values,
    };
  }

  // Career credential
  categories.career = {
    careerStage: profile.career.careerStage,
    ...(profile.career.currentRole && { currentRole: profile.career.currentRole }),
    ...(profile.career.industry && { industry: profile.career.industry }),
  };

  // Demographics credential (opt-in only)
  if (profile.demographics.spokenLanguages.length > 0) {
    categories.demographics = {
      spokenLanguages: profile.demographics.spokenLanguages,
      ...(profile.demographics.locationGeneral && {
        locationRegion: profile.demographics.locationGeneral,
      }),
      ...(profile.demographics.ageRange && {
        ageRange: profile.demographics.ageRange,
      }),
    };
  }

  return categories;
}

function inferExperienceBand(skills: { mentions: number }[]): string {
  const maxMentions = Math.max(...skills.map((s) => s.mentions));
  if (maxMentions > 20) return "10+yr";
  if (maxMentions > 10) return "5-10yr";
  if (maxMentions > 5) return "3-5yr";
  return "1-3yr";
}
