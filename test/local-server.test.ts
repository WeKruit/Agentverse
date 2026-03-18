// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startLocalServer, type LocalServerInstance } from "../src/local-server/api.js";
import { clearRegistry } from "../src/discovery/bucket-registry.js";
import { clearProposals } from "../src/discovery/match-protocol.js";
import { generateLocalEmbedding, cosineSimilarity } from "../src/discovery/embeddings.js";

let server: LocalServerInstance;

beforeAll(async () => {
  clearRegistry();
  clearProposals();
  server = await startLocalServer({
    name: "Test Server",
    did: "did:key:test-server",
    open_to: ["recruiting", "cofounder"],
  });
});

afterAll(async () => {
  await server.close();
});

describe("Local API Server", () => {
  it("serves health endpoint", async () => {
    const res = await fetch(`${server.url}/health`);
    const data = await res.json();

    expect(data.status).toBe("ok");
    expect(data.name).toBe("Test Server");
    expect(data.mode).toBe("local-simulated-tee");
  });

  it("serves Agent Card at well-known path", async () => {
    const res = await fetch(`${server.url}/.well-known/agent.json`);
    const card = await res.json();

    expect(card.name).toBe("Test Server");
    expect(card.did).toBe("did:key:test-server");
    expect(card.open_to).toContain("recruiting");
    expect(card.url).toContain(`localhost:${server.port}`);
  });

  it("lists available buckets", async () => {
    const res = await fetch(`${server.url}/api/buckets`);
    const data = await res.json();

    expect(data.buckets.length).toBeGreaterThanOrEqual(4);
    expect(data.buckets.map((b: any) => b.id)).toContain("recruiting-swe");
  });

  it("submits agent and runs matching", async () => {
    // Submit Alice
    const aliceRes = await fetch(`${server.url}/api/buckets/recruiting-swe/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filesystem: {
          purpose: "recruiting",
          created_at: new Date().toISOString(),
          owner_did: "did:key:alice",
          structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr" },
        },
      }),
    });
    const alice = await aliceRes.json();
    expect(alice.listing.id).toBeDefined();

    // Submit Bob
    await fetch(`${server.url}/api/buckets/recruiting-swe/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filesystem: {
          purpose: "recruiting",
          created_at: new Date().toISOString(),
          owner_did: "did:key:bob",
          structured: { skills: ["rust", "go"], experienceBand: "3-5yr" },
        },
      }),
    });

    // Run matching for Alice
    const matchRes = await fetch(`${server.url}/api/buckets/recruiting-swe/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: alice.listing.id }),
    });
    const matchData = await matchRes.json();

    expect(matchData.matches.length).toBe(1);
    expect(matchData.matches[0].matched_on.length).toBeGreaterThan(0);
  });

  it("accepts A2A VP messages", async () => {
    const res = await fetch(`${server.url}/a2a`, {
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
              data: { verifiablePresentation: { type: "VP", test: true } },
            }],
          },
        },
      }),
    });

    const data = await res.json();
    expect(data.result.status.state).toBe("completed");
  });

  it("handles contact requests via A2A", async () => {
    const res = await fetch(`${server.url}/a2a`, {
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
                from_did: "did:key:someone",
                purpose: "recruiting",
                message_summary: "Rust role",
                requested_topics: ["skills"],
              },
            }],
          },
        },
      }),
    });

    const data = await res.json();
    // Should be accepted since "recruiting" is in open_to
    expect(data.result.status.state).toBe("completed");
  });
});

describe("Local Embeddings", () => {
  it("generates consistent embeddings for same input", () => {
    const a = generateLocalEmbedding({ skills: ["rust", "typescript"] });
    const b = generateLocalEmbedding({ skills: ["rust", "typescript"] });

    expect(a.length).toBe(384);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("similar profiles produce higher similarity than dissimilar", () => {
    const rust = generateLocalEmbedding({
      skills: ["rust", "distributed-systems", "backend"],
      experienceBand: "5-10yr",
    });
    const alsoRust = generateLocalEmbedding({
      skills: ["rust", "systems-programming", "backend"],
      experienceBand: "5-10yr",
    });
    const frontend = generateLocalEmbedding({
      skills: ["react", "css", "frontend"],
      experienceBand: "1-3yr",
    });

    const similarSim = cosineSimilarity(rust, alsoRust);
    const dissimilarSim = cosineSimilarity(rust, frontend);

    expect(similarSim).toBeGreaterThan(dissimilarSim);
  });

  it("produces normalized vectors", () => {
    const emb = generateLocalEmbedding({ skills: ["rust"] });
    let norm = 0;
    for (const v of emb) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 5);
  });
});
