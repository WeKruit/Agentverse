// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { AGENTVERSE_DIR } from "./init.js";
import { fetchAgentCard } from "../a2a/agent-card.js";
import { sendVP } from "../a2a/client.js";
import { readJsonFile } from "../wallet/storage.js";
import { importKeyPair, type KeyPairExport } from "../wallet/keys.js";
import { generatePresentation, verifyPresentation } from "../wallet/presentation.js";
import {
  loadPolicy,
  evaluatePolicy,
  addRule,
  savePolicy,
  promptConsent,
} from "../consent/manager.js";
import { logSharingEvent } from "../consent/audit.js";

export const shareCommand = new Command("share")
  .description("Share profile attributes with a third-party agent")
  .requiredOption("--with <domain>", "Target agent domain (e.g., ditto.ai)")
  .option("--purpose <purpose>", "Purpose for sharing (e.g., dating-profile)")
  .option(
    "--preset <name>",
    "Disclosure preset: minimal | professional | full",
    "minimal"
  )
  .option("--force", "Skip consent prompt")
  .action(async (options) => {
    const basePath = AGENTVERSE_DIR;
    const domain = options.with;
    const purpose = options.purpose;
    const preset = options.preset;

    // 1. Check wallet is initialized
    const credDir = path.join(basePath, "credentials");
    if (!fs.existsSync(credDir)) {
      console.log("No credentials found. Run:");
      console.log("  agentverse init");
      console.log("  agentverse extract");
      console.log("  agentverse wallet issue");
      return;
    }

    const vcFiles = fs.readdirSync(credDir).filter((f) => f.endsWith(".vc.json"));
    if (vcFiles.length === 0) {
      console.log("No credentials issued. Run 'agentverse wallet issue' first.");
      return;
    }

    // 2. Fetch Agent Card
    console.log(`\nFetching Agent Card from ${domain}...`);
    let agentCard;
    try {
      agentCard = await fetchAgentCard(domain);
      console.log(`  Agent: ${agentCard.name}`);
      console.log(`  URL: ${agentCard.url}`);
    } catch (err: any) {
      console.error(`  Failed to fetch Agent Card: ${err.message}`);
      logSharingEvent(path.join(basePath, "audit", "sharing.log"), {
        agent_domain: domain,
        purpose,
        attributes_disclosed: [],
        status: "error",
      });
      return;
    }

    // 3. Evaluate consent
    const policyPath = path.join(basePath, "policies", "_default.json");
    const policy = loadPolicy(policyPath);
    const { action } = evaluatePolicy(policy, domain, purpose);

    if (action === "deny") {
      console.log("\n  Sharing denied by policy.");
      logSharingEvent(path.join(basePath, "audit", "sharing.log"), {
        agent_domain: domain,
        agent_did: agentCard.did,
        purpose,
        attributes_disclosed: [],
        status: "denied",
      });
      return;
    }

    // Determine what attributes the preset will disclose
    const { PRESETS } = await import("../wallet/presentation.js");
    const presetFields = PRESETS[preset] || PRESETS.minimal;

    if (action === "prompt" && !options.force) {
      const decision = await promptConsent(agentCard, purpose, presetFields);

      if (!decision.allowed) {
        console.log("\n  Sharing cancelled.");
        logSharingEvent(path.join(basePath, "audit", "sharing.log"), {
          agent_domain: domain,
          agent_did: agentCard.did,
          purpose,
          attributes_disclosed: [],
          status: "denied",
        });
        return;
      }

      // If "always allow", persist the rule
      if (decision.persist) {
        const updated = addRule(policy, {
          domain,
          purpose,
          action: "allow",
          attributes: presetFields,
        });
        savePolicy(policyPath, updated);
        console.log("  Rule saved: always allow for this agent + purpose.");
      }
    }

    // 4. Load key pair
    console.log("\nGenerating verifiable presentation...");
    const pubKeyPath = path.join(basePath, "keys", "master.pub.json");
    const encKeyPath = path.join(basePath, "keys", "master.key.enc");

    if (!fs.existsSync(pubKeyPath) || !fs.existsSync(encKeyPath)) {
      console.log("  Keys not found. Run 'agentverse init' first.");
      return;
    }

    const pubKey = readJsonFile<KeyPairExport>(pubKeyPath);
    const { readAndDecrypt } = await import("../wallet/storage.js");
    const passphrase = "agentverse-dev"; // TODO: prompt for passphrase
    const secretData = readAndDecrypt(encKeyPath, passphrase);

    const keyPair = await importKeyPair({
      ...pubKey,
      secretKeyMultibase: secretData.secretKeyMultibase,
    });

    // 5. Pick a credential that has the most overlap with the preset
    // For MVP, use the skills credential as the primary one
    const skillsVcPath = path.join(credDir, "skills.vc.json");
    let signedVC;

    if (fs.existsSync(skillsVcPath)) {
      signedVC = readJsonFile(skillsVcPath);
    } else {
      // Fall back to the first available credential
      signedVC = readJsonFile(path.join(credDir, vcFiles[0]));
    }

    // 6. Generate VP with selective disclosure
    let derivedVC;
    try {
      derivedVC = await generatePresentation(signedVC, preset, keyPair);
    } catch (err: any) {
      console.error(`  Failed to generate VP: ${err.message}`);
      return;
    }

    const disclosed = Object.keys(derivedVC.credentialSubject || {}).filter(
      (k) => k !== "id"
    );
    const hidden = Object.keys(signedVC.credentialSubject || {}).filter(
      (k) => k !== "id" && !disclosed.includes(k)
    );

    console.log(`  Disclosed (${disclosed.length}): ${disclosed.join(", ")}`);
    console.log(`  Hidden (${hidden.length}): ${hidden.join(", ")}`);

    // 7. Verify locally before sending
    const verifyResult = await verifyPresentation(derivedVC, keyPair);
    if (!verifyResult.verified) {
      console.error("  VP verification failed locally. Aborting.");
      return;
    }
    console.log("  Local verification: passed");

    // 8. Send via A2A
    console.log(`\nSending to ${agentCard.name}...`);
    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: "VerifiablePresentation",
      verifiableCredential: [derivedVC],
    };

    try {
      const result = await sendVP(agentCard.url, vp);
      console.log(`  Status: ${result.status}`);
      if (result.message) console.log(`  Message: ${result.message}`);

      // 9. Audit log
      const vpHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(derivedVC))
        .digest("hex")
        .slice(0, 16);

      logSharingEvent(path.join(basePath, "audit", "sharing.log"), {
        agent_domain: domain,
        agent_did: agentCard.did,
        purpose,
        attributes_disclosed: disclosed,
        status: "shared",
        vp_hash: vpHash,
      });

      console.log(`\n  Shared successfully with ${agentCard.name}`);
      console.log(`  VP hash: ${vpHash}`);
      console.log(`  Audit entry written.`);
    } catch (err: any) {
      console.error(`  Failed to send: ${err.message}`);
      logSharingEvent(path.join(basePath, "audit", "sharing.log"), {
        agent_domain: domain,
        agent_did: agentCard.did,
        purpose,
        attributes_disclosed: disclosed,
        status: "error",
      });
    }
  });
