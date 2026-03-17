// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  startMockAgent,
  type MockAgentInstance,
} from "../src/mock-agent/server.js";
import { fetchAgentCard } from "../src/a2a/agent-card.js";
import { sendVP } from "../src/a2a/client.js";
import { generateMasterKeyPair } from "../src/wallet/keys.js";
import { issueCredential } from "../src/wallet/credentials.js";
import {
  generatePresentation,
  verifyPresentation,
} from "../src/wallet/presentation.js";
import { logSharingEvent, verifyAuditChain } from "../src/consent/audit.js";
import {
  evaluatePolicy,
  type ConsentPolicy,
} from "../src/consent/manager.js";

let mockAgent: MockAgentInstance;
let testDir: string;

beforeAll(async () => {
  mockAgent = await startMockAgent();
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-integ-"));
});

afterAll(async () => {
  await mockAgent.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("Agent Card Discovery", () => {
  it("fetches Agent Card from mock agent", async () => {
    const card = await fetchAgentCard(`http://localhost:${mockAgent.port}`);

    expect(card.name).toBe("Test Agent");
    expect(card.url).toContain(`localhost:${mockAgent.port}`);
    expect(card.skills).toHaveLength(1);
    expect(card.open_to).toContain("testing");
  });
});

describe("A2A Communication", () => {
  it("sends a VP to mock agent via SendMessage", async () => {
    const vp = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: "VerifiablePresentation",
      verifiableCredential: [{ type: "TestCredential" }],
    };

    const result = await sendVP(`${mockAgent.url}/a2a`, vp);

    expect(result.status).toBe("completed");
    expect(result.taskId).toBeDefined();
    expect(result.message).toBe("VP received and processed");

    // Verify mock agent received the message
    const messages = mockAgent.getReceivedMessages();
    expect(messages.length).toBeGreaterThan(0);
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.method).toBe("message/send");
    expect(lastMsg.parts[0].data.verifiablePresentation).toBeDefined();
  });
});

describe("Full Share Flow", () => {
  it("end-to-end: generate keys → issue VC → derive proof → send → verify receipt", async () => {
    // 1. Generate keys
    const { keyPair } = await generateMasterKeyPair();

    // 2. Issue credential with profile data
    const claims = {
      skills: ["rust", "typescript", "distributed-systems"],
      experienceBand: "5-10yr",
      experienceYears: 7,
      values: ["autonomy", "impact"],
      locationRegion: "US-West",
      availability: "full-time",
      lookingFor: "biz-cofounder",
      domain: "fintech",
      about: "Built payment infrastructure at scale.",
      projectHighlights: ["payment-pipeline"],
    };

    const signedVC = await issueCredential(claims, keyPair);
    expect(signedVC.proof).toBeDefined();

    // 3. Derive selective disclosure proof (reveal only 3 of 10)
    const derivedVC = await generatePresentation(
      signedVC,
      ["skills", "experienceBand", "lookingFor"],
      keyPair
    );

    // Verify only selected fields are present
    expect(derivedVC.credentialSubject.skills).toBeDefined();
    expect(derivedVC.credentialSubject.experienceBand).toBeDefined();
    expect(derivedVC.credentialSubject.lookingFor).toBeDefined();
    expect(derivedVC.credentialSubject.about).toBeUndefined();
    expect(derivedVC.credentialSubject.locationRegion).toBeUndefined();

    // 4. Verify the derived proof locally
    const verifyResult = await verifyPresentation(derivedVC, keyPair);
    expect(verifyResult.verified).toBe(true);

    // 5. Send to mock agent
    const sendResult = await sendVP(`${mockAgent.url}/a2a`, {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: "VerifiablePresentation",
      verifiableCredential: [derivedVC],
    });
    expect(sendResult.status).toBe("completed");

    // 6. Verify mock agent received the correct data
    const messages = mockAgent.getReceivedMessages();
    const lastMsg = messages[messages.length - 1];
    const receivedVP = lastMsg.parts[0].data.verifiablePresentation;
    expect(receivedVP.verifiableCredential[0].credentialSubject.skills).toEqual([
      "rust",
      "typescript",
      "distributed-systems",
    ]);

    // 7. Log to audit trail
    const logPath = path.join(testDir, "audit", "sharing.log");
    const auditEntry = logSharingEvent(logPath, {
      agent_domain: `localhost:${mockAgent.port}`,
      purpose: "integration-test",
      attributes_disclosed: ["skills", "experienceBand", "lookingFor"],
      status: "shared",
    });
    expect(auditEntry.status).toBe("shared");

    // 8. Verify audit chain
    const chainResult = verifyAuditChain(logPath);
    expect(chainResult.valid).toBe(true);
  }, 30000);
});

describe("Consent Integration", () => {
  it("policy allows matching domain+purpose", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        {
          domain: `localhost:${mockAgent.port}`,
          purpose: "testing",
          action: "allow",
          attributes: ["skills"],
        },
      ],
    };

    const result = evaluatePolicy(
      policy,
      `localhost:${mockAgent.port}`,
      "testing"
    );
    expect(result.action).toBe("allow");
  });

  it("policy denies non-matching purpose", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        {
          domain: `localhost:${mockAgent.port}`,
          purpose: "testing",
          action: "allow",
        },
      ],
    };

    const result = evaluatePolicy(
      policy,
      `localhost:${mockAgent.port}`,
      "dating"
    );
    expect(result.action).toBe("prompt");
  });
});

describe("Selective Disclosure Presets", () => {
  it("'minimal' reveals only skills", async () => {
    const { keyPair } = await generateMasterKeyPair();
    const signedVC = await issueCredential(
      {
        skills: ["rust"],
        experienceBand: "5-10yr",
        values: ["impact"],
        availability: "full-time",
        lookingFor: "cofounder",
        about: "secret details",
      },
      keyPair
    );

    const derived = await generatePresentation(signedVC, "minimal", keyPair);
    expect(derived.credentialSubject.skills).toBeDefined();
    expect(derived.credentialSubject.experienceBand).toBeUndefined();
    expect(derived.credentialSubject.about).toBeUndefined();

    const result = await verifyPresentation(derived, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);

  it("'professional' reveals skills, experience, values, availability, lookingFor", async () => {
    const { keyPair } = await generateMasterKeyPair();
    const signedVC = await issueCredential(
      {
        skills: ["typescript"],
        experienceBand: "3-5yr",
        values: ["collaboration"],
        availability: "part-time",
        lookingFor: "freelance",
        about: "hidden bio",
        locationRegion: "EU",
      },
      keyPair
    );

    const derived = await generatePresentation(
      signedVC,
      "professional",
      keyPair
    );
    expect(derived.credentialSubject.skills).toBeDefined();
    expect(derived.credentialSubject.experienceBand).toBeDefined();
    expect(derived.credentialSubject.values).toBeDefined();
    expect(derived.credentialSubject.availability).toBeDefined();
    expect(derived.credentialSubject.lookingFor).toBeDefined();
    expect(derived.credentialSubject.about).toBeUndefined();
    expect(derived.credentialSubject.locationRegion).toBeUndefined();

    const result = await verifyPresentation(derived, keyPair);
    expect(result.verified).toBe(true);
  }, 30000);
});
