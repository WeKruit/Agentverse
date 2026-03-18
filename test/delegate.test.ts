// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildFilesystem,
  isExpired,
  getStructuredFields,
  getEvaluableFields,
} from "../src/delegate/filesystem.js";
import {
  spawnDelegate,
  scoreCompatibility,
  recordScore,
  escalateDelegate,
  destroyDelegate,
  getDelegate,
  listActiveDelegates,
  cleanupExpiredDelegates,
  clearAllDelegates,
} from "../src/delegate/lifecycle.js";
import {
  triageContactRequest,
  clearRateLimits,
} from "../src/delegate/contact-handler.js";
import {
  saveRelationship,
  loadRelationship,
  listRelationships,
  recordInteraction,
  endRelationship,
  createRelationshipFromMatch,
} from "../src/delegate/relationships.js";
import {
  issueReferralToken,
  verifyReferralToken,
} from "../src/delegate/referrals.js";
import {
  signPayload,
  verifySignedPayload,
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  encryptForRecipient,
  decryptEnvelope,
  signThenEncrypt,
  decryptThenVerify,
} from "../src/delegate/sign-then-encrypt.js";
import { startDoorbellServer } from "../src/delegate/doorbell-server.js";
import { sendVP } from "../src/a2a/client.js";
import { fetchAgentCard } from "../src/a2a/agent-card.js";
import { generateMasterKeyPair } from "../src/wallet/keys.js";
import type { ExtractedProfile } from "../src/extractor/types.js";

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-delegate-"));
  clearAllDelegates();
  clearRateLimits();
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ─── Split Filesystem ─────────────────────────────────────────

describe("Split Filesystem", () => {
  const mockProfile: ExtractedProfile = {
    skills: [
      { name: "rust", confidence: 0.9, mentions: 15, firstSeen: "2026-01-01", lastSeen: "2026-03-01", source: "behavioral" },
      { name: "typescript", confidence: 0.8, mentions: 10, firstSeen: "2026-01-15", lastSeen: "2026-03-01", source: "behavioral" },
    ],
    interests: [{ topic: "hiking", confidence: 0.7, mentions: 3 }],
    communication: { verbosity: "moderate", formality: "professional", technicalDepth: "advanced" },
    values: ["autonomy", "impact"],
    career: { careerStage: "mid-career", currentRole: "Staff Engineer", industry: "fintech" },
    demographics: { spokenLanguages: ["English"], locationGeneral: "US-West" },
    metadata: { extractedAt: "2026-03-01", conversationCount: 100, sourceBreakdown: { "claude-code": 100 } },
  };

  it("builds a recruiting filesystem with correct tiers", () => {
    const fs = buildFilesystem(mockProfile, "recruiting", "did:key:test");

    expect(fs.purpose).toBe("recruiting");
    expect(fs.owner_did).toBe("did:key:test");
    expect(fs.structured.skills).toEqual(["rust", "typescript"]);
    expect(fs.structured.careerStage).toBe("mid-career");
    expect(fs.evaluable_text?.about).toContain("Staff Engineer");
    expect(fs.expires_at).toBeDefined();
  });

  it("builds a dating filesystem with different fields", () => {
    const fs = buildFilesystem(mockProfile, "dating", "did:key:test");

    expect(fs.structured.interests).toEqual(["hiking"]);
    expect(fs.structured.spokenLanguages).toEqual(["English"]);
    expect(fs.structured.skills).toBeUndefined(); // Skills not relevant for dating
  });

  it("sets expiration correctly", () => {
    const fs = buildFilesystem(mockProfile, "recruiting", "did:key:test", 1);
    expect(isExpired(fs)).toBe(false);

    // Create an expired filesystem
    const expired = { ...fs, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(isExpired(expired)).toBe(true);
  });

  it("returns correct field lists", () => {
    const fs = buildFilesystem(mockProfile, "recruiting", "did:key:test");
    expect(getStructuredFields(fs).length).toBeGreaterThan(0);
    expect(getStructuredFields(fs)).toContain("skills");
  });
});

// ─── Delegate Lifecycle ──────────────────────────────────────

describe("Delegate Lifecycle", () => {
  it("spawns a delegate with scoped filesystem", () => {
    const fs = {
      purpose: "recruiting",
      created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust"], experienceBand: "5-10yr" },
    };

    const delegate = spawnDelegate("recruiting", "did:key:bob", fs);

    expect(delegate.id).toMatch(/^delegate-/);
    expect(delegate.purpose).toBe("recruiting");
    expect(delegate.peer_did).toBe("did:key:bob");
    expect(delegate.status).toBe("active");
    expect(delegate.filesystem.structured.skills).toEqual(["rust"]);
  });

  it("scores compatibility between two filesystems", () => {
    const ours = {
      purpose: "cofounder",
      created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: {
        skills: ["rust", "ml", "distributed-systems"],
        values: ["autonomy", "impact"],
        experienceBand: "5-10yr",
      },
    };

    const theirs = {
      purpose: "cofounder",
      created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: {
        skills: ["rust", "product", "design"],
        values: ["autonomy", "creativity"],
        experienceBand: "5-10yr",
      },
    };

    const result = scoreCompatibility(ours, theirs);

    expect(result.signal).toBeDefined();
    expect(["strong", "good", "possible", "weak"]).toContain(result.signal);
    expect(result.matched_on.length).toBeGreaterThan(0);
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeLessThanOrEqual(500);
  });

  it("records score and changes delegate status", () => {
    const delegate = spawnDelegate(
      "test",
      "did:key:peer",
      { purpose: "test", created_at: new Date().toISOString(), owner_did: "did:key:me", structured: {} }
    );

    recordScore(delegate.id, {
      signal: "strong",
      matched_on: ["rust"],
      gaps: [],
      recommend_escalate: true,
      summary: "Good match",
    });

    const updated = getDelegate(delegate.id);
    expect(updated?.status).toBe("scored");
    expect(updated?.scoring_result?.signal).toBe("strong");
  });

  it("escalates and destroys delegates", () => {
    const delegate = spawnDelegate(
      "test",
      "did:key:peer",
      { purpose: "test", created_at: new Date().toISOString(), owner_did: "did:key:me", structured: {} }
    );

    escalateDelegate(delegate.id);
    expect(getDelegate(delegate.id)?.status).toBe("escalated");

    const destroyed = destroyDelegate(delegate.id);
    expect(destroyed?.status).toBe("completed");
    expect(getDelegate(delegate.id)).toBeUndefined();
  });

  it("lists active delegates", () => {
    spawnDelegate("a", "did:1", { purpose: "a", created_at: new Date().toISOString(), owner_did: "did:me", structured: {} });
    spawnDelegate("b", "did:2", { purpose: "b", created_at: new Date().toISOString(), owner_did: "did:me", structured: {} });

    expect(listActiveDelegates()).toHaveLength(2);
  });

  it("cleans up expired delegates", () => {
    const delegate = spawnDelegate(
      "test",
      "did:key:peer",
      {
        purpose: "test",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
        owner_did: "did:key:me",
        structured: {},
      }
    );

    const cleaned = cleanupExpiredDelegates();
    expect(cleaned).toBe(1);
    expect(getDelegate(delegate.id)).toBeUndefined();
  });
});

// ─── Contact Handler ────────────────────────────────────────

describe("Contact Handler (Deterministic Triage)", () => {
  const baseRequest = {
    type: "contact_request" as const,
    from_did: "did:key:bob",
    from_name: "Bob",
    purpose: "recruiting" as const,
    message_summary: "Senior Rust role at Climate Corp",
    requested_topics: ["skills", "experience"],
  };

  it("denies when purpose is blocked", () => {
    const policy = {
      default_action: "deny" as const,
      purposes: { recruiting: { action: "deny" as const } },
    };

    const result = triageContactRequest(baseRequest, policy);
    expect(result.action).toBe("deny");
  });

  it("approves when policy allows the purpose", () => {
    const policy = {
      default_action: "deny" as const,
      purposes: {
        recruiting: {
          action: "allow" as const,
          allowed_topics: ["skills", "experience"],
        },
      },
    };

    const result = triageContactRequest(baseRequest, policy);
    expect(result.action).toBe("approve");
  });

  it("prompts when no matching purpose policy", () => {
    const policy = { default_action: "deny" as const };
    const result = triageContactRequest(baseRequest, policy);
    expect(result.action).toBe("deny");
  });

  it("auto-approves with referral when configured", () => {
    const policy = {
      default_action: "deny" as const,
      purposes: {
        recruiting: {
          action: "prompt" as const,
          auto_approve_if: { has_referral: true },
        },
      },
    };

    const requestWithReferral = { ...baseRequest, referral_token: { some: "token" } };
    const result = triageContactRequest(requestWithReferral, policy);
    expect(result.action).toBe("approve");
    expect(result.trust_level).toBe("trusted");
  });

  it("denies when requested topics are not allowed", () => {
    const policy = {
      default_action: "deny" as const,
      purposes: {
        recruiting: {
          action: "prompt" as const,
          allowed_topics: ["skills"],
        },
      },
    };

    const requestWithBadTopic = {
      ...baseRequest,
      requested_topics: ["skills", "salary"], // salary not allowed
    };

    const result = triageContactRequest(requestWithBadTopic, policy);
    expect(result.action).toBe("deny");
    expect(result.reason).toContain("salary");
  });

  it("enforces rate limits", () => {
    const policy = {
      default_action: "prompt" as const,
      rate_limits: { per_sender_per_hour: 2, total_per_day: 10 },
    };

    triageContactRequest(baseRequest, policy);
    triageContactRequest(baseRequest, policy);
    const third = triageContactRequest(baseRequest, policy);

    expect(third.action).toBe("deny");
    expect(third.reason).toContain("Rate limit");
  });

  it("elevates trust level with credential", () => {
    const policy = { default_action: "prompt" as const };
    const requestWithCred = { ...baseRequest, credential: { proof: "valid" } };

    const result = triageContactRequest(requestWithCred, policy);
    expect(result.trust_level).toBe("verified");
  });
});

// ─── Relationship Records ──────────────────────────────────

describe("Relationship Records", () => {
  it("creates and loads a relationship", () => {
    const record = createRelationshipFromMatch(
      testDir, "did:key:bob", "Bob", "cofounder", ["skills", "values"]
    );

    expect(record.status).toBe("active");
    expect(record.preset).toEqual(["skills", "values"]);

    const loaded = loadRelationship(testDir, "did:key:bob");
    expect(loaded).toBeDefined();
    expect(loaded!.peer_name).toBe("Bob");
  });

  it("records interactions", () => {
    createRelationshipFromMatch(testDir, "did:key:bob", "Bob", "cofounder", ["skills"]);

    const updated = recordInteraction(testDir, "did:key:bob", ["equity", "timeline"]);
    expect(updated!.interactions).toBe(2);
    expect(updated!.topics_discussed).toContain("equity");
  });

  it("lists all relationships", () => {
    createRelationshipFromMatch(testDir, "did:key:bob", "Bob", "cofounder", ["skills"]);
    createRelationshipFromMatch(testDir, "did:key:carol", "Carol", "recruiting", ["experience"]);

    const all = listRelationships(testDir);
    expect(all).toHaveLength(2);
  });

  it("ends a relationship", () => {
    createRelationshipFromMatch(testDir, "did:key:bob", "Bob", "cofounder", ["skills"]);

    const ended = endRelationship(testDir, "did:key:bob");
    expect(ended).toBe(true);

    const loaded = loadRelationship(testDir, "did:key:bob");
    expect(loaded!.status).toBe("ended");
  });

  it("returns null for unknown peer", () => {
    const loaded = loadRelationship(testDir, "did:key:unknown");
    expect(loaded).toBeNull();
  });
});

// ─── Referral Tokens ────────────────────────────────────────

describe("Referral Tokens", () => {
  it("issues and verifies a referral token", async () => {
    const { keyPair } = await generateMasterKeyPair();

    const claims = {
      referee_did: "did:key:bob",
      target_did: "did:key:alice",
      purpose: "recruiting",
      vouching_level: "professional-acquaintance" as const,
      message: "Bob is great for this role",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const token = await issueReferralToken(keyPair, claims);
    expect(token.proof).toBeDefined();
    expect(token.credentialSubject.referee_did).toBe("did:key:bob");

    const result = await verifyReferralToken(token, keyPair, "did:key:alice");
    expect(result.valid).toBe(true);
    expect(result.claims!.purpose).toBe("recruiting");
  }, 30000);

  it("rejects expired referral token", async () => {
    const { keyPair } = await generateMasterKeyPair();

    const token = await issueReferralToken(keyPair, {
      referee_did: "did:key:bob",
      target_did: "did:key:alice",
      purpose: "recruiting",
      vouching_level: "acquaintance",
      expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
    });

    const result = await verifyReferralToken(token, keyPair, "did:key:alice");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  }, 30000);

  it("rejects referral for wrong target", async () => {
    const { keyPair } = await generateMasterKeyPair();

    const token = await issueReferralToken(keyPair, {
      referee_did: "did:key:bob",
      target_did: "did:key:alice",
      purpose: "recruiting",
      vouching_level: "colleague",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const result = await verifyReferralToken(token, keyPair, "did:key:carol");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not addressed to us");
  }, 30000);
});

// ─── Sign-Then-Encrypt ──────────────────────────────────────

describe("Sign-Then-Encrypt", () => {
  it("signs and verifies a payload", () => {
    const { publicKey, privateKey } = generateSigningKeyPair();

    const signed = signPayload("hello world", privateKey, "did:key:alice");
    expect(signed.algorithm).toBe("Ed25519");

    const result = verifySignedPayload(signed, publicKey);
    expect(result.valid).toBe(true);
    expect(result.data).toBe("hello world");
  });

  it("rejects tampered signature", () => {
    const { publicKey, privateKey } = generateSigningKeyPair();

    const signed = signPayload("hello world", privateKey, "did:key:alice");
    signed.payload = Buffer.from("tampered").toString("base64url");

    const result = verifySignedPayload(signed, publicKey);
    expect(result.valid).toBe(false);
  });

  it("encrypts and decrypts with X25519 ECDH", () => {
    const recipient = generateEncryptionKeyPair();

    const envelope = encryptForRecipient(
      "secret data",
      recipient.publicKey,
      "did:key:bob#enc",
      "did:key:alice"
    );

    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.ephemeral_public_key).toBeDefined();
    expect(envelope.recipient_key_id).toBe("did:key:bob#enc");

    const decrypted = decryptEnvelope(envelope, recipient.privateKey);
    expect(decrypted).toBe("secret data");
  });

  it("full sign-then-encrypt → decrypt-then-verify flow", () => {
    const sender = generateSigningKeyPair();
    const recipient = generateEncryptionKeyPair();

    const envelope = signThenEncrypt(
      '{"vp": "test-presentation"}',
      sender.privateKey,
      "did:key:alice",
      recipient.publicKey,
      "did:key:bob#enc"
    );

    const result = decryptThenVerify(
      envelope,
      recipient.privateKey,
      sender.publicKey
    );

    expect(result.valid).toBe(true);
    expect(result.data).toBe('{"vp": "test-presentation"}');
    expect(result.signer_did).toBe("did:key:alice");
  });

  it("different recipient cannot decrypt", () => {
    const sender = generateSigningKeyPair();
    const recipient = generateEncryptionKeyPair();
    const wrongRecipient = generateEncryptionKeyPair();

    const envelope = signThenEncrypt(
      "secret",
      sender.privateKey,
      "did:key:alice",
      recipient.publicKey,
      "did:key:bob#enc"
    );

    expect(() =>
      decryptEnvelope(envelope, wrongRecipient.privateKey)
    ).toThrow();
  });
});

// ─── Doorbell Server ────────────────────────────────────────

describe("Doorbell Server", () => {
  let doorbell;

  afterEach(async () => {
    if (doorbell) {
      await doorbell.close();
      doorbell = null;
    }
  });

  it("serves a minimal Agent Card", async () => {
    doorbell = await startDoorbellServer({
      name: "Alice",
      did: "did:key:alice",
      open_to: ["recruiting", "collaboration"],
      policy: { default_action: "prompt" },
    });

    const card = await fetchAgentCard(`http://localhost:${doorbell.port}`);

    expect(card.name).toBe("Alice");
    expect(card.did).toBe("did:key:alice");
    expect(card.open_to).toEqual(["recruiting", "collaboration"]);
    // Should NOT have skills or attributes — doorbell, not window
    expect(card.skills).toBeUndefined();
  });

  it("accepts and triages contact requests", async () => {
    doorbell = await startDoorbellServer({
      name: "Alice",
      did: "did:key:alice",
      open_to: ["recruiting"],
      policy: {
        default_action: "deny",
        purposes: {
          recruiting: {
            action: "allow",
            allowed_topics: ["skills"],
          },
        },
      },
    });

    // Send a contact request via A2A
    const response = await fetch(`${doorbell.url}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [{
              type: "data",
              data: {
                type: "contact_request",
                from_did: "did:key:bob",
                from_name: "Bob",
                purpose: "recruiting",
                message_summary: "Rust role",
                requested_topics: ["skills"],
              },
            }],
          },
        },
      }),
    });

    const result = await response.json();
    expect(result.result.status.state).toBe("completed");
    expect(result.result.status.message).toContain("accepted");

    const requests = doorbell.getReceivedRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].triage.action).toBe("approve");
  });

  it("denies contact requests for blocked purposes", async () => {
    doorbell = await startDoorbellServer({
      name: "Alice",
      did: "did:key:alice",
      open_to: ["recruiting"],
      policy: {
        default_action: "deny",
        purposes: {
          recruiting: { action: "deny" },
        },
      },
    });

    const response = await fetch(`${doorbell.url}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "2",
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [{
              type: "data",
              data: {
                type: "contact_request",
                from_did: "did:key:bob",
                purpose: "recruiting",
                message_summary: "Hi",
                requested_topics: ["skills"],
              },
            }],
          },
        },
      }),
    });

    const result = await response.json();
    expect(result.result.status.state).toBe("failed");
  });
});
