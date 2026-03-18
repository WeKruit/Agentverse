import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getOrCreateMetrics,
  recordProposal,
  recordAcceptance,
  recordDecline,
  recordExpiry,
  recordCompletion,
  recordReport,
  recordReferral,
  computeReputation,
  detectAnomalies,
  clearMetrics,
} from "../src/ecosystem/reputation.js";
import {
  generateMatchToken,
  verifyParticipation,
  saveMatchToken,
  loadMatchTokens,
} from "../src/ecosystem/match-tokens.js";
import {
  exportAllData,
  eraseAllData,
} from "../src/ecosystem/gdpr.js";
import { initializeDirectory, writeJsonFile } from "../src/wallet/storage.js";
import { logSharingEvent } from "../src/consent/audit.js";

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-eco-"));
  clearMetrics();
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ─── Reputation Engine ──────────────────────────────────────

describe("Reputation Engine", () => {
  it("creates metrics for new agent", () => {
    const metrics = getOrCreateMetrics("did:key:alice");
    expect(metrics.did).toBe("did:key:alice");
    expect(metrics.matches_proposed).toBe(0);
  });

  it("tracks proposals and responses", () => {
    recordProposal("did:key:alice");
    recordProposal("did:key:alice");
    recordAcceptance("did:key:alice", 5000);
    recordDecline("did:key:alice");

    const metrics = getOrCreateMetrics("did:key:alice");
    expect(metrics.matches_proposed).toBe(2);
    expect(metrics.matches_accepted).toBe(1);
    expect(metrics.matches_declined).toBe(1);
  });

  it("computes reputation score", () => {
    // Simulate a well-behaved agent
    for (let i = 0; i < 5; i++) {
      recordProposal("did:key:good");
      recordAcceptance("did:key:good", 3600000); // 1 hour response
    }
    recordCompletion("did:key:good");
    recordCompletion("did:key:good");
    recordCompletion("did:key:good");

    const score = computeReputation("did:key:good");
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.components.response_rate).toBeGreaterThan(0);
    expect(score.components.completion_rate).toBeGreaterThan(0);
    expect(["new", "bronze", "silver", "gold", "platinum"]).toContain(score.tier);
  });

  it("penalizes agents with reports", () => {
    recordProposal("did:key:reported");
    recordAcceptance("did:key:reported", 1000);
    recordCompletion("did:key:reported");
    const before = computeReputation("did:key:reported");

    recordReport("did:key:reported");
    recordReport("did:key:reported");
    const after = computeReputation("did:key:reported");

    expect(after.components.no_reports).toBeLessThan(before.components.no_reports);
  });

  it("rewards referral activity", () => {
    recordReferral("did:key:carol", "did:key:alice");
    recordReferral("did:key:carol", "did:key:bob");

    const score = computeReputation("did:key:carol");
    expect(score.components.referral_activity).toBeGreaterThan(0);
  });

  it("boosts network trust from referrals", () => {
    // Carol is well-established
    for (let i = 0; i < 10; i++) {
      recordProposal("did:key:carol");
      recordAcceptance("did:key:carol", 1000);
      recordCompletion("did:key:carol");
    }

    // Carol refers Alice
    recordReferral("did:key:carol", "did:key:alice");

    const aliceScore = computeReputation("did:key:alice");
    expect(aliceScore.components.network_trust).toBeGreaterThan(0.1);
  });

  it("detects anomalous agents", () => {
    // Agent with many proposals but zero responses
    for (let i = 0; i < 15; i++) {
      recordProposal("did:key:suspicious");
    }

    const anomalies = detectAnomalies();
    expect(anomalies.some((a) => a.did === "did:key:suspicious")).toBe(true);
  });

  it("assigns tiers correctly", () => {
    // New agent
    const newScore = computeReputation("did:key:new-agent");
    expect(newScore.tier).toBe("new");

    // Active agent
    for (let i = 0; i < 10; i++) {
      recordProposal("did:key:active");
      recordAcceptance("did:key:active", 1800000);
      recordCompletion("did:key:active");
    }
    const activeScore = computeReputation("did:key:active");
    expect(["bronze", "silver", "gold", "platinum"]).toContain(activeScore.tier);
  });
});

// ─── Match Tokens ───────────────────────────────────────────

describe("Match Tokens", () => {
  it("generates a match token", () => {
    const token = generateMatchToken(
      "recruiting-swe",
      "did:key:alice",
      "did:key:bob",
      "strong",
      ["rust", "distributed-systems"]
    );

    expect(token.id).toMatch(/^token-/);
    expect(token.commitment).toBeDefined();
    expect(token.commitment.length).toBe(64); // SHA-256 hex
    expect(token.proof_a).toBeDefined();
    expect(token.proof_b).toBeDefined();
    expect(token.proof_a).not.toBe(token.proof_b);
  });

  it("verifies participation correctly", () => {
    const token = generateMatchToken(
      "recruiting-swe",
      "did:key:alice",
      "did:key:bob",
      "good",
      ["skills"]
    );

    // Alice can verify with her proof
    expect(verifyParticipation(token, "did:key:alice", token.proof_a)).toBe(true);

    // Bob can verify with his proof
    expect(verifyParticipation(token, "did:key:bob", token.proof_b)).toBe(true);

    // Carol cannot verify (wrong DID)
    expect(verifyParticipation(token, "did:key:carol", token.proof_a)).toBe(false);

    // Wrong proof for right DID
    expect(verifyParticipation(token, "did:key:alice", token.proof_b)).toBe(false);
  });

  it("saves and loads tokens", () => {
    const token = generateMatchToken(
      "recruiting-swe",
      "did:key:alice",
      "did:key:bob",
      "strong",
      ["rust"]
    );

    saveMatchToken(testDir, token);

    const loaded = loadMatchTokens(testDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(token.id);
    expect(loaded[0].commitment).toBe(token.commitment);
  });

  it("hides participant identities in commitment", () => {
    const token = generateMatchToken(
      "recruiting-swe",
      "did:key:alice",
      "did:key:bob",
      "strong",
      ["rust"]
    );

    // The commitment should NOT contain the raw DIDs
    expect(token.commitment).not.toContain("alice");
    expect(token.commitment).not.toContain("bob");
  });
});

// ─── GDPR Compliance ────────────────────────────────────────

describe("GDPR Compliance", () => {
  it("exports all user data", () => {
    initializeDirectory(testDir);

    // Create some data
    writeJsonFile(path.join(testDir, "profile.json"), {
      skills: [{ name: "rust" }],
    });
    writeJsonFile(path.join(testDir, "did", "did.json"), {
      id: "did:key:test",
    });
    logSharingEvent(path.join(testDir, "audit", "sharing.log"), {
      agent_domain: "test.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    const exported = exportAllData(testDir);

    expect(exported.format_version).toBe("1.0");
    expect(exported.profile).toBeDefined();
    expect(exported.profile.skills[0].name).toBe("rust");
    expect(exported.did_document.id).toBe("did:key:test");
    expect(exported.audit_log).toHaveLength(1);
    expect(exported.metadata.total_sharing_events).toBe(1);
    expect(exported.metadata.agents_shared_with).toContain("test.com");
  });

  it("erases all data except audit log", () => {
    initializeDirectory(testDir);
    writeJsonFile(path.join(testDir, "profile.json"), { test: true });
    writeJsonFile(path.join(testDir, "did", "did.json"), { id: "test" });
    logSharingEvent(path.join(testDir, "audit", "sharing.log"), {
      agent_domain: "test.com",
      attributes_disclosed: [],
      status: "shared",
    });

    const result = eraseAllData(testDir, true);

    expect(result.deleted.length).toBeGreaterThan(0);
    expect(result.kept).toContain("audit/ (retained for compliance)");

    // Profile should be gone
    expect(fs.existsSync(path.join(testDir, "profile.json"))).toBe(false);
    // Keys should be gone
    expect(fs.existsSync(path.join(testDir, "keys"))).toBe(false);
    // Audit should remain
    expect(fs.existsSync(path.join(testDir, "audit"))).toBe(true);
  });

  it("erases everything including audit when requested", () => {
    initializeDirectory(testDir);
    logSharingEvent(path.join(testDir, "audit", "sharing.log"), {
      agent_domain: "test.com",
      attributes_disclosed: [],
      status: "shared",
    });

    const result = eraseAllData(testDir, false);

    expect(result.deleted).toContain("audit/");
    expect(fs.existsSync(path.join(testDir, "audit"))).toBe(false);
  });
});
