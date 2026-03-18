import { describe, it, expect, beforeEach } from "vitest";
import {
  initializeRegistry,
  createBucket,
  getBucket,
  listBuckets,
  submitAgent,
  getActiveListings,
  withdrawListing,
  cleanupExpiredListings,
  clearRegistry,
} from "../src/discovery/bucket-registry.js";
import { findMatches } from "../src/discovery/matching-engine.js";
import {
  createMatchProposals,
  acceptProposal,
  declineProposal,
  getPendingProposals,
  checkMutualAccept,
  clearProposals,
} from "../src/discovery/match-protocol.js";
import { createLocalVenue } from "../src/discovery/venue.js";
import type { DelegateFilesystem } from "../src/delegate/types.js";

beforeEach(() => {
  clearRegistry();
  clearProposals();
});

// ─── Bucket Registry ────────────────────────────────────────

describe("Bucket Registry", () => {
  it("initializes with default buckets", () => {
    initializeRegistry();
    const buckets = listBuckets();
    expect(buckets.length).toBeGreaterThanOrEqual(4);
    expect(buckets.map((b) => b.id)).toContain("recruiting-swe");
    expect(buckets.map((b) => b.id)).toContain("cofounder-search");
  });

  it("creates a custom bucket", () => {
    const bucket = createBucket("ML Engineers", "recruiting", ["skills", "experienceBand"]);
    expect(bucket.id).toContain("recruiting-ml-engineers");
    expect(bucket.category).toBe("recruiting");
    expect(getBucket(bucket.id)).toBeDefined();
  });

  it("submits an agent listing to a bucket", () => {
    initializeRegistry();

    const filesystem: DelegateFilesystem = {
      purpose: "recruiting",
      created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr" },
    };

    const listing = submitAgent("recruiting-swe", filesystem);
    expect(listing.id).toMatch(/^listing-/);
    expect(listing.bucket_id).toBe("recruiting-swe");
    expect(listing.structured.skills).toEqual(["rust", "typescript"]);
    expect(listing.commitment_hash).toBeDefined();
  });

  it("tracks agent count in bucket", () => {
    initializeRegistry();

    const fs1: DelegateFilesystem = {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    };
    const fs2: DelegateFilesystem = {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob", structured: { skills: ["python"] },
    };

    submitAgent("recruiting-swe", fs1);
    submitAgent("recruiting-swe", fs2);

    const bucket = getBucket("recruiting-swe");
    expect(bucket!.agent_count).toBe(2);
  });

  it("withdraws a listing", () => {
    initializeRegistry();
    const listing = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    });

    const success = withdrawListing("recruiting-swe", listing.id);
    expect(success).toBe(true);
    expect(getActiveListings("recruiting-swe")).toHaveLength(0);
  });

  it("cleans up expired listings", () => {
    initializeRegistry();

    // Submit with already-expired TTL
    const listing = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    }, undefined, 0); // 0 hours = expired immediately

    // Manually set expiry to past
    listing.expires_at = new Date(Date.now() - 1000).toISOString();

    const cleaned = cleanupExpiredListings();
    expect(cleaned).toBe(1);
  });
});

// ─── Matching Engine ────────────────────────────────────────

describe("Matching Engine", () => {
  it("finds matches based on field overlap", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust", "typescript", "distributed-systems"], experienceBand: "5-10yr" },
    });

    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: { skills: ["rust", "go", "kubernetes"], experienceBand: "5-10yr" },
    });

    const matches = findMatches(alice, getActiveListings("recruiting-swe"));

    expect(matches.length).toBe(1);
    expect(matches[0].listing_b_id).toBe(bob.id);
    expect(matches[0].matched_on.length).toBeGreaterThan(0);
    expect(matches[0].mutual).toBe(true);
  });

  it("excludes self-matches", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust"] },
    });

    const matches = findMatches(alice, getActiveListings("recruiting-swe"));
    expect(matches.length).toBe(0);
  });

  it("enforces mutual dealbreakers", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: {
        skills: ["rust"],
        experienceBand: "5-10yr",
        excluded_domain: ["gambling", "weapons"],
      },
    });

    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: {
        skills: ["rust"],
        experienceBand: "5-10yr",
        domain: "gambling", // Alice's dealbreaker!
      },
    });

    const matches = findMatches(alice, getActiveListings("recruiting-swe"));
    // Should be filtered out by dealbreaker
    expect(matches.length).toBe(0);
  });

  it("uses embedding similarity when available", () => {
    initializeRegistry();

    // Create simple embeddings (production: from sentence-transformers)
    const aliceEmb = new Array(10).fill(0).map((_, i) => i * 0.1);
    const bobEmb = new Array(10).fill(0).map((_, i) => i * 0.1 + 0.01); // very similar
    const carolEmb = new Array(10).fill(0).map((_, i) => (10 - i) * 0.1); // dissimilar

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust"] },
    }, aliceEmb);

    submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: { skills: ["rust"] },
    }, bobEmb);

    submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:carol",
      structured: { skills: ["rust"] },
    }, carolEmb);

    const matches = findMatches(alice, getActiveListings("recruiting-swe"));

    // Bob should score higher than Carol (more similar embedding)
    expect(matches.length).toBe(2);
    expect(matches[0].listing_b_id).not.toBe(alice.id);
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });

  it("produces coarse signal categories", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr", values: ["autonomy"] },
    });

    submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr", values: ["autonomy"] },
    });

    const matches = findMatches(alice, getActiveListings("recruiting-swe"));
    expect(["strong", "good", "possible", "weak"]).toContain(matches[0].signal);
  });
});

// ─── Match Protocol ─────────────────────────────────────────

describe("Match Protocol", () => {
  it("creates proposals for both parties", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust"] },
    });

    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: { skills: ["rust", "go"] },
    });

    const matchResult = {
      listing_a_id: alice.id,
      listing_b_id: bob.id,
      signal: "good" as const,
      matched_on: ["skills: rust"],
      gaps: [],
      score: 0.6,
      mutual: true,
    };

    const { proposalForA, proposalForB } = createMatchProposals(matchResult, alice, bob);

    expect(proposalForA.peer_structured.skills).toEqual(["rust", "go"]); // A sees B's data
    expect(proposalForB.peer_structured.skills).toEqual(["rust"]); // B sees A's data
    expect(proposalForA.status).toBe("pending");
    expect(proposalForB.status).toBe("pending");
  });

  it("accepts and declines proposals", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    });
    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob", structured: { skills: ["rust"] },
    });

    const matchResult = {
      listing_a_id: alice.id, listing_b_id: bob.id,
      signal: "good" as const, matched_on: ["rust"], gaps: [],
      score: 0.6, mutual: true,
    };

    const { proposalForA, proposalForB } = createMatchProposals(matchResult, alice, bob);

    // Alice accepts
    const accepted = acceptProposal(proposalForA.id);
    expect(accepted!.status).toBe("accepted");

    // Bob declines
    const declined = declineProposal(proposalForB.id);
    expect(declined).toBe(true);
  });

  it("detects mutual acceptance", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    });
    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob", structured: { skills: ["rust"] },
    });

    const { proposalForA, proposalForB } = createMatchProposals(
      { listing_a_id: alice.id, listing_b_id: bob.id, signal: "good", matched_on: [], gaps: [], score: 0.6, mutual: true },
      alice, bob
    );

    // Only Alice accepts — not mutual yet
    acceptProposal(proposalForA.id);
    expect(checkMutualAccept(proposalForA.id, proposalForB.id)).toBe(false);

    // Bob accepts — now mutual
    acceptProposal(proposalForB.id);
    expect(checkMutualAccept(proposalForA.id, proposalForB.id)).toBe(true);
  });

  it("expires proposals after timeout", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    });
    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob", structured: { skills: ["rust"] },
    });

    const { proposalForA } = createMatchProposals(
      { listing_a_id: alice.id, listing_b_id: bob.id, signal: "good", matched_on: [], gaps: [], score: 0.6, mutual: true },
      alice, bob, 0 // 0 hours = expires immediately
    );

    // Manually expire
    proposalForA.expires_at = new Date(Date.now() - 1000).toISOString();

    const accepted = acceptProposal(proposalForA.id);
    expect(accepted).toBeNull(); // Expired, can't accept
  });

  it("lists pending proposals", () => {
    initializeRegistry();

    const alice = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice", structured: { skills: ["rust"] },
    });
    const bob = submitAgent("recruiting-swe", {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob", structured: { skills: ["rust"] },
    });

    createMatchProposals(
      { listing_a_id: alice.id, listing_b_id: bob.id, signal: "good", matched_on: [], gaps: [], score: 0.6, mutual: true },
      alice, bob
    );

    const pending = getPendingProposals();
    expect(pending.length).toBe(2); // One for each party
  });
});

// ─── Venue SDK ──────────────────────────────────────────────

describe("Venue SDK (Simulated TEE)", () => {
  it("creates a local venue with default buckets", () => {
    const venue = createLocalVenue();
    expect(venue.config.name).toBe("Local Dev Venue");
    expect(venue.listBuckets().length).toBeGreaterThanOrEqual(4);
  });

  it("submits and matches through a venue", () => {
    const venue = createLocalVenue();

    const aliceFs: DelegateFilesystem = {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr" },
    };

    const bobFs: DelegateFilesystem = {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:bob",
      structured: { skills: ["rust", "go"], experienceBand: "3-5yr" },
    };

    const aliceListing = venue.submit("recruiting-swe", aliceFs);
    venue.submit("recruiting-swe", bobFs);

    const matches = venue.match("recruiting-swe", aliceListing.id);
    expect(matches.length).toBe(1);

    // Proposals should have been auto-created
    const proposals = venue.getProposals();
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects submission to unserved bucket", () => {
    const venue = createLocalVenue();

    expect(() =>
      venue.submit("nonexistent-bucket", {
        purpose: "test", created_at: new Date().toISOString(),
        owner_did: "did:key:test", structured: {},
      })
    ).toThrow();
  });

  it("respects max proposals per agent", () => {
    const venue = createLocalVenue();

    // Submit Alice
    const aliceFs: DelegateFilesystem = {
      purpose: "recruiting", created_at: new Date().toISOString(),
      owner_did: "did:key:alice",
      structured: { skills: ["rust"] },
    };
    const aliceListing = venue.submit("recruiting-swe", aliceFs);

    // Submit 10 other agents
    for (let i = 0; i < 10; i++) {
      venue.submit("recruiting-swe", {
        purpose: "recruiting", created_at: new Date().toISOString(),
        owner_did: `did:key:agent-${i}`,
        structured: { skills: ["rust", `skill-${i}`] },
      });
    }

    venue.match("recruiting-swe", aliceListing.id);

    // Proposals should be capped at max_proposals_per_agent (5)
    // Each match creates 2 proposals (one for each party), so max 10 proposals total
    const proposals = venue.getProposals();
    const proposalsForAlice = proposals.filter(
      (p) => p.peer_listing_id !== aliceListing.id
    );
    expect(proposalsForAlice.length).toBeLessThanOrEqual(
      venue.config.matching_config.max_proposals_per_agent
    );
  });
});
