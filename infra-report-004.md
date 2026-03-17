# Infrastructure Report 004 — Distilled Agents + Bucket Architecture

**Team:** Infra
**Date:** 2026-03-16
**Status:** Complete
**Research Method:** Deep multi-agent research (7 parallel agents with web search)
**Addresses:** Spencer conversation (distilled agents + buckets), CEO review (cold start), architecture revision

---

## Executive Summary

The Spencer "distilled agent" concept fundamentally improves the EACP architecture. Key findings:

1. **Distillation is Layer 1.5** — sits between Identity (Layer 1) and Discovery (Layer 2). PII never enters the commons. Injection firewall shifts from transport to distillation pipeline.
2. **Buckets and venues are distinct** — venues are the ACCESS layer (operators), buckets are the MATCHING layer (namespaces). Many-to-many relationship enables cross-venue matching.
3. **A2A is the best registration foundation** — extend Agent Cards with distillation metadata. HKDF-derived keys make cross-bucket agents unlinkable.
4. **Buckets solve cold start** — converts a 4-sided platform cold start (venues + supply + demand + more venues) into a 1-sided community cold start (users installing CLI). Critical mass: ~50-100 agents per recruiting bucket.
5. **Bridge model for isolation** — per-bucket encryption keys, separate HNSW indices, but shared infrastructure. Inspired by Slack EKM + Discord per-server profiles.
6. **Ephemeral by design** — distilled agents have TTL, are crypto-shredded after match, with epoch-based forward-secure deletion.

---

## Table of Contents

1. [Protocol Support for Distilled Agents](#1-protocol-support-for-distilled-agents)
2. [Bucket Isolation Architecture](#2-bucket-isolation-architecture)
3. [Bucket Creation and Governance](#3-bucket-creation-and-governance)
4. [Updated Architecture: Where Distilled Agents Sit](#4-updated-architecture)
5. [Within-Bucket Matching](#5-within-bucket-matching)
6. [Cold Start: How Buckets Solve Chicken-and-Egg](#6-cold-start)
7. [Sources](#7-sources)

---

## 1. Protocol Support for Distilled Agents

### 1.1 Protocol Comparison

| Protocol | Distilled Agent Support | Verdict |
|----------|------------------------|---------|
| **A2A** | Agent Card extensible via `AgentExtension`. Supports multiple agents per domain, JWS signing, authenticated extended cards. Gaps: no TTL, no parent binding, no ephemeral lifecycle. | **Best foundation** — extend with distillation metadata |
| **ACP** | Merged into A2A (August 2025). IBM's Kate Blair joined A2A TSC. No longer separate. | **Use A2A** |
| **MCP** | Wrong abstraction — MCP is tool/context access (client-server), not agent identity. Belongs in the stack as context brokering, not agent representation. | **Not for registration** |
| **ANP** | Strongest identity model (DID:WBA) but immature spec. Being developed under W3C AI Agent Protocol CG. Best for cross-bucket unlinkability. | **Watch, don't build on yet** |
| **IETF ANS** | Most complete registration lifecycle (register/renew/revoke with PKI, TTL caching). Expired draft. | **Borrow patterns** |

### 1.2 A2A Distilled Agent Card Extension

```json
{
  "name": "DA-recruiting-a7f3",
  "description": "Distilled agent: Senior SWE, distributed systems, SF Bay Area",
  "version": "1.0.0",
  "skills": [
    {"id": "rust-systems", "name": "Rust Systems Programming", "tags": ["rust", "distributed-systems"]}
  ],
  "extensions": [{
    "name": "EACP Distillation Metadata",
    "uri": "urn:eacp:distillation:v1",
    "required": true,
    "params": {
      "parent_binding": "<HMAC proving cryptographic link to user DID without revealing it>",
      "bucket_id": "eacp://buckets/recruiting/senior-swe-sf",
      "exchange_info_schema": "urn:eacp:schema:recruiting:v1",
      "status": "ACTIVE",
      "ttl_seconds": 604800,
      "created_at": "2026-03-16T10:00:00Z",
      "expires_at": "2026-03-23T10:00:00Z",
      "distillation_version": "1.0.0",
      "pii_classification": "exchange_only"
    }
  }]
}
```

### 1.3 Identity Key Architecture

Each distilled agent gets HKDF-derived keys from the user's master key:

```
User Master Key (Ed25519)
    |
    +-- HKDF-Extract(bucket_salt, master_key)
         |
         +-- HKDF-Expand("EACP-DISTILL-V1-Ed25519:" || HMAC(user_nonce, bucket_id || epoch), 32)
              |
              = Distilled Agent Ed25519 Key Pair
```

**Unlinkability guarantee:** Two distilled agents from the same user in different buckets have cryptographically unrelated keys. Without knowledge of the master key AND the per-bucket nonce, they cannot be linked.

**Does it need its own card?** Yes — each distilled agent registers as an independent A2A Agent Card. The parent binding is a one-way HMAC, not a plaintext reference.

### 1.4 Lifecycle State Machine

```
CREATED --> ACTIVE --> MATCHING --> MATCHED --> REMOVED
                |                      |
                +---> EXPIRED ---------+
                |
                +---> WITHDRAWN -------+
```

- **CREATED:** Distillation complete, not yet in commons
- **ACTIVE:** In bucket, available for matching
- **MATCHING:** Mutual interest detected, pending confirmation
- **MATCHED:** Both parties confirmed, agents removed from bucket
- **EXPIRED:** TTL exceeded, auto-removed
- **WITHDRAWN:** User manually removed
- **REMOVED:** Crypto-shredded, only Tessera audit entry remains

---

## 2. Bucket Isolation Architecture

### 2.1 Platform Isolation Lessons

| Platform | Model | Key Pattern for EACP |
|----------|-------|---------------------|
| **Reddit** | Pool (shared DB, `subreddit_id` partition) | Subreddit-specific rules + AutoMod on top of site-wide rules |
| **Discord** | Pool storage + process isolation per guild | Per-server member lists with unlinkable profiles; separation of creation from discovery |
| **Slack** | Pool + Row-Level Security + per-workspace encryption keys (EKM) | 5-scope key hierarchy; Enterprise Grid for workspace hierarchy |
| **App Store** | Fixed platform-defined categories (24 Apple, 33 Google) | Categories never user-created; editorial curation for discovery |

### 2.2 Recommended: Bridge Model with Per-Bucket Encryption

**Shared physical infrastructure, per-bucket logical isolation and encryption:**

| Isolation Dimension | Per-Bucket? | Rationale |
|--------------------|------------|-----------|
| **Encryption key** | Yes | Per-bucket key hierarchy (inspired by Slack EKM). Separate bucket key means compromising one bucket doesn't affect others. |
| **HNSW matching index** | Yes | Separate index per bucket enables domain-specific embedding models and limits breach blast radius. |
| **Registry namespace** | Yes | `did:eacp:agent:<bucket_id>:<agent_id>` — agents in different buckets have unlinkable DIDs (inspired by Discord per-server profiles). |
| **Matching rules** | Yes | Each bucket defines its own exchange info schema + scoring algorithm + capacity limits. |
| **TEE enclave** | Shared | Same enclave fleet serves multiple buckets (cost efficiency). Bucket isolation enforced by key separation. |
| **Tessera log** | Shared | Single transparency log with bucket_id as entry metadata. Separate sharding unnecessary at MVP scale. |
| **Cross-bucket queries** | Denied by default | Opt-in only via BBS+ ZK proofs (Reddit crossposting model — reference, not duplication). |

### 2.3 Four-Level Key Hierarchy

```
Platform Root Key
    |
    +-- Bucket Key (HKDF from root + bucket_id)
         |
         +-- Venue Instance Key (HKDF from bucket key + venue_id)
              |
              +-- Epoch Key (HKDF from instance key + epoch_counter)
                   |
                   +-- Session Key (per-match, ephemeral)
```

Epoch rotation: hourly. All prior-epoch distilled agents become unreadable when the epoch key is destroyed (forward-secure deletion).

### 2.4 Two-Tier Rules

- **Protocol-wide (non-overridable):** Max exchange info size, TTL bounds (min 1 hour, max 30 days), injection pattern blacklist, required audit log entries
- **Bucket-specific (additive):** Exchange info schema, scoring algorithm, matching rules, capacity limits, moderation policies

Bucket rules are signed policy documents validated by TEE attestation — a bucket operator cannot silently change rules.

---

## 3. Bucket Creation and Governance

### 3.1 Phased Creation Model

| Phase | Timeline | Who Creates | Limit | Model |
|-------|----------|------------|-------|-------|
| **Phase 1** | Day 1 - Month 6 | Developers only | 50 buckets max | Like early Reddit (admin-created subreddits) / App Store categories |
| **Phase 2** | Month 6 - Year 1 | Curated user creation | 500 buckets | Like Discord Server Discovery (creation open, listing gated) |
| **Phase 3** | Year 1+ | Open with governance | No hard cap | Like mature Reddit (open creation, moderation, cleanup) |

**Key insight from Discord:** Separate creation from discovery. Anyone can create a bucket (Phase 2+), but only buckets meeting activity/quality thresholds appear in discovery. Discord maintains 67% weekly-active servers vs Reddit's 3-4% active subreddits — this pattern works.

### 3.2 Naming: Hierarchical (GitHub Model)

```
eacp://buckets/{operator-did}/{bucket-slug}

Examples:
  eacp://buckets/did:eacp:wekruit/senior-swe-sf
  eacp://buckets/did:eacp:wekruit/dating-outdoors-nyc
  eacp://buckets/did:eacp:community/rust-developers-global
```

**Why hierarchical:** GitHub has 630M+ repos without naming conflicts because repos are scoped to owners (`owner/repo`). Reddit's flat `/r/name` namespace caused rampant squatting. Hierarchical naming prevents this structurally.

### 3.3 Lifecycle

```
PROPOSED --> CREATED --> ACTIVE --> STALE --> ARCHIVED --> DELETED
                                     |
                                     +--> ACTIVE (reactivation on new agents)
```

| State | Trigger | Consequence |
|-------|---------|-------------|
| **PROPOSED** | Bucket definition submitted | Awaits approval (Phase 1) or auto-created (Phase 2+) |
| **CREATED** | Approved, schema registered | Not yet discoverable; creator populating |
| **ACTIVE** | Has ≥1 agent, matching operational | Listed in discovery if meets thresholds |
| **STALE** | No new agents in 30 days | Warning to creator; reduced discovery ranking |
| **ARCHIVED** | No agents in 90 days (or manual) | No matching; preserved for audit |
| **DELETED** | 180 days archived + no reclaim | Crypto-shredded; only Tessera entries remain |

### 3.4 Proliferation Control

- **Economic soft governance:** Bucket creation requires a small deposit (refundable on archival). Ongoing TEE compute costs create natural pressure to maintain only useful buckets.
- **Duplicate detection:** Embedding-based similarity check against existing buckets at creation time. Flag potential duplicates for manual review.
- **Activity thresholds for discovery:** Only buckets with ≥10 active agents + ≥1 match in last 7 days appear in search.
- **Auto-archival:** 30-day inactivity triggers stale state, 90 days triggers archive.

---

## 4. Updated Architecture

### 4.1 Revised Protocol Stack

```
+================================================================+
|  LAYER 0: Transport & Identity                                  |
|  TLS 1.3 + MLS sessions + DID identity + reduced firewall      |
+================================================================+
|  LAYER 1: Identity & Registry                                   |
|  DID creation (did:jwk → did:webvh) + Agent Card registration  |
|  + key generation + registry enrollment                         |
+================================================================+
|  LAYER 1.5: DISTILLATION PIPELINE  ← NEW                       |
|  LLM history → context extraction → exchange/PII split →       |
|  injection firewall (5-layer) → agent assembly →                |
|  transparency log entry                                         |
|                                                                 |
|  OUTPUT: DistilledAgent (exchange info) + PII Vault (local)     |
+================================================================+
|  LAYER 2: Bucket Discovery                                      |
|  Bucket registry + A2A Agent Card publication +                 |
|  three-phase search (pre-filter → ANN → re-rank)               |
+================================================================+
|  LAYER 3: Privacy-Preserving Matching (within bucket)           |
|  PSI eligibility + TEE scoring on EXCHANGE INFO ONLY            |
|  (no PII in TEE → simpler, faster, smaller attack surface)     |
+================================================================+
|  LAYER 4: Verifiable Output                                     |
|  Match receipts + Tessera transparency log + audit proofs       |
+================================================================+
|  LAYER 4.5: CONSENT GATE  ← NEW                                |
|  Human-in-the-loop PII reveal decision                          |
|  User reviews match → selects PII fields → BBS+ proof          |
|  NO automated disclosure. Per-instance consent.                 |
+================================================================+
|  LAYER 5: Selective Disclosure (post-match only)                |
|  BBS+ proofs for consented PII fields                           |
|  E2E encrypted PII exchange via MLS channel                     |
+================================================================+
|  LAYER 6: Bucket & Venue Isolation                              |
|  Per-bucket keys + per-venue policies + audit roots             |
|  Venues = access layer, Buckets = matching layer                |
+================================================================+
```

### 4.2 Key Architectural Changes from Whitepaper

| Aspect | Original Whitepaper | Distilled Agent Model |
|--------|-------------------|----------------------|
| **What enters commons** | Encrypted full profile (PII + exchange info) | Exchange info ONLY (PII never enters) |
| **Injection firewall** | At transport layer (Layer 0) | At distillation pipeline (Layer 1.5) |
| **BBS+ selective disclosure** | During matching (Layer 3) | Post-match PII reveal only (Layer 5) |
| **TEE processes** | Full profile with PII | Exchange info only (smaller, faster) |
| **Matching abstraction** | Venues (apps) | Buckets (categories) within venues (operators) |
| **PII reveal** | Automated via BBS+ | Human-in-the-loop consent gate |
| **Agent persistence** | Persistent in venue | Ephemeral — removed after match |
| **Cold start** | Need multiple venues | Need agents in one bucket |

### 4.3 Venues vs Buckets: Two-Tier Topology

```
┌─────────────────────────────────────────────────────────┐
│                    ACCESS LAYER (Venues)                  │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ WeKruit   │  │ LinkedIn  │  │ Organic   │              │
│  │ (Venue)   │  │ Bridge    │  │ CLI Users │              │
│  │           │  │ (Venue)   │  │ (Venue)   │              │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘               │
│        │              │              │                     │
│        │    distilled agents enter    │                    │
│        │              │              │                     │
└────────┼──────────────┼──────────────┼────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                  MATCHING LAYER (Buckets)                 │
│                                                           │
│  ┌────────────────────────────────────────────┐          │
│  │  Bucket: senior-swe-sf                      │          │
│  │  Schema: recruiting.v1                      │          │
│  │  Agents from: WeKruit + LinkedIn + Organic  │          │
│  │  Matching: PSI + TEE on exchange info       │          │
│  └────────────────────────────────────────────┘          │
│                                                           │
│  ┌────────────────────────────────────────────┐          │
│  │  Bucket: outdoors-dating-nyc                │          │
│  │  Schema: dating.v1                          │          │
│  │  Agents from: Organic CLI users             │          │
│  └────────────────────────────────────────────┘          │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**Relationship:** Many-to-many. A venue can feed agents into multiple buckets. A bucket can receive agents from multiple venues. This is the key architectural insight that enables cross-venue matching.

### 4.4 Exchange Info / PII Boundary

**Enforced at distillation time by schema-based classification:**

Each bucket defines an exchange info schema that authoritatively declares which fields are exchange (enter commons), PII (never enter), or irrelevant (discarded).

```
┌─────────────────────────┐
│   User's LLM History     │  ← Untrusted input
└───────────┬─────────────┘
            │
    ┌───────▼────────┐
    │  DISTILLATION   │  ← Injection firewall here
    │  PIPELINE       │
    │                 │
    │  1. Extract     │
    │  2. Classify    │  schema lookup, not ML
    │  3. Sanitize    │
    │  4. Assemble    │
    └──┬──────────┬──┘
       │          │
       ▼          ▼
  ┌─────────┐ ┌────────┐
  │Exchange  │ │PII     │
  │Info Pack │ │Vault   │
  │→ COMMONS │ │→ LOCAL │  ← PII never leaves user device
  └─────────┘ └────────┘
```

**Legal note:** Exchange info is pseudonymized personal data under GDPR (not anonymous). GDPR still applies in full. Differential privacy (epsilon 2-4 per category) recommended to reduce singling-out risk.

---

## 5. Within-Bucket Matching

### 5.1 Matching Flow

```
1. Distilled agent enters bucket (with TTL: 7 days default)
2. Matching engine runs continuously:
   a. Pre-filter: attribute intersection (PSI on exchange info constraints)
   b. Scoring: semantic similarity on exchange info embeddings (inside TEE)
   c. Candidate ranking: weighted re-rank
3. Mutual interest check: both agents must opt in
4. On confirmation:
   a. Both distilled agents set to MATCHED
   b. Match receipt generated and logged to Tessera
   c. Both agents crypto-shredded from bucket
   d. Users notified with exchange info only
5. Consent gate: each user decides whether to reveal PII
6. If both consent: BBS+ selective disclosure over MLS channel
7. If no match within TTL: agent expires, crypto-shredded
```

### 5.2 Ephemeral Listing Design

| Property | Implementation |
|----------|---------------|
| **TTL** | Default 7 days, configurable per bucket (min 1 hour, max 30 days). Stored as `expires_at` timestamp. |
| **Crypto-shredding** | Per-listing DEK (Data Encryption Key). Destroy key = destroy listing, even if ciphertext persists in caches. |
| **Epoch rotation** | Hourly epoch keys. All prior-epoch listings become unreadable when epoch key is destroyed. |
| **Concurrent match prevention** | Enclave-serialized Compare-And-Swap (CAS). One enclave per bucket processes matches serially — leverages existing one-enclave-per-venue constraint. |
| **Confirmation timeout** | 5 minutes for automated agents, 24 hours for human-in-the-loop. Unconfirmed matches release back to ACTIVE. |
| **Replay prevention** | Nonces + epoch binding + TEE non-exfiltration guarantees. Stale listings are cryptographically invalid after epoch rotation. |

### 5.3 Listing States

```
ACTIVE ──────→ PENDING_MATCH ──→ MATCHED ──→ REMOVED (crypto-shredded)
   |                |
   |                +──→ ACTIVE (timeout, match rejected)
   |
   +──→ EXPIRED ──→ REMOVED (crypto-shredded)
   |
   +──→ WITHDRAWN ──→ REMOVED (crypto-shredded)
```

### 5.4 Simplification from Original Architecture

Since distilled agents contain only exchange info (not PII), matching is simpler:

| Original (full profile matching) | Distilled agent matching |
|--------------------------------|------------------------|
| TEE processes PII + exchange info | TEE processes exchange info only |
| BBS+ needed during matching | BBS+ only post-match |
| Field-level encryption per venue | Per-bucket encryption, no field-level needed |
| Complex PII leakage attack surface | PII never in TEE — entire attack class eliminated |
| ~500ms latency | ~410ms latency (no PII decryption overhead) |

---

## 6. Cold Start: How Buckets Solve Chicken-and-Egg

### 6.1 The Fundamental Shift

| Dimension | Venue Model (Original) | Bucket Model (Spencer) |
|-----------|----------------------|----------------------|
| **Cold start type** | 4-sided platform (venues + supply + demand + more venues) | 1-sided community (users installing CLI) |
| **Network effects** | Per-venue: more users on WeKruit → WeKruit better. Cross-venue: zero. | Per-bucket: more agents in senior-swe-sf → better matches for ALL sources. Cross-source: positive. |
| **What you need first** | Venue developers to build apps | Users to create distilled agents |
| **Critical mass** | Multiple venues before protocol effects | One bucket with ~50-100 agents |
| **Comparable** | Launching the App Store (need apps + users) | Starting a Discord server (need members) |

### 6.2 Critical Mass Estimates

| Bucket Type | Minimum Viable | Good Experience | Research Basis |
|-------------|---------------|----------------|---------------|
| **Recruiting (niche)** | 50 agents | 200+ agents | Job boards work with ~50 candidates per posting |
| **Recruiting (broad)** | 200 agents | 1,000+ agents | LinkedIn requires ~200 matches per search |
| **Dating (local)** | 300 agents | 1,000+ agents | Dating apps need geographic density |
| **Freelance** | 30 agents | 100+ agents | Upwork-style matching works with smaller pools |
| **Developer matching** | 20 agents | 100+ agents | Niche co-founder matching is viable at 20 |

### 6.3 Pre-Population Strategies

**Strategy 1: Bridge Agents (Airbnb's Craigslist Model)**
Import public profiles from existing platforms (with consent) as seed distilled agents:
- LinkedIn public profiles → recruiting buckets
- GitHub profiles → developer buckets
- Public dating profiles (opt-in) → dating buckets

Airbnb reverse-engineered Craigslist posting to bootstrap supply. EACP can offer "Import your LinkedIn" as a one-click distillation.

**Strategy 2: CLI-as-Viral-Loop (Tinder's Campus Model)**
The CLI profile generator creates single-player value before any marketplace exists:
1. User installs CLI → extracts profile from Claude Code/ChatGPT → sees their "distilled agent"
2. The profile itself is the reward (like Spotify Wrapped — shareable, viral)
3. User accumulates agents before buckets launch
4. When buckets launch, there's already a warm pool of agents

**Strategy 3: Concentrated Launch (Uber's City Model)**
Launch ONE bucket with maximum density, not 10 buckets spread thin:
- Target: `senior-swe-sf` — highest-value, densest niche
- Seed with 100 agents from WeKruit + organic CLI users
- Prove matching works before expanding

### 6.4 Twenty-Week Playbook

| Phase | Weeks | Goal | Agents |
|-------|-------|------|--------|
| **1: CLI + Accumulation** | 1-8 | Ship CLI, accumulate agents with no marketplace. "Generate your encrypted developer profile." | 500 distilled agents created (no matching yet) |
| **2: First Bucket** | 9-12 | Launch `senior-swe-sf` bucket. 100 agents enter. Prove matching works. | 100 active in bucket |
| **3: Expand** | 13-16 | Add 4 more buckets (dating, freelance, 2 more recruiting niches). Bridge imports from LinkedIn/GitHub. | 500 active across 5 buckets |
| **4: Organic Growth** | 17-20 | Self-sustaining organic growth. User-created buckets (Phase 2 governance). | 2,000+ active |

### 6.5 Why This Works Better Than Venues

The bucket model converts **"who builds the next app?"** (hard — requires venue developer investment) into **"who joins the community?"** (easier — requires installing a CLI).

In the venue model, you need WeKruit to succeed, THEN convince other developers to build apps. In the bucket model, you need 100 people to generate distilled agents, THEN matching works — regardless of how many venues exist. The CLI itself creates agents; venues are just one source among many.

---

## 7. Sources

### Protocol Analysis
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A Agent Discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)
- [ACP-A2A Merger Announcement](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [ANP — W3C AI Agent Protocol CG](https://www.w3.org/community/ai-agent-protocol/)
- [IETF ANS Draft](https://datatracker.ietf.org/doc/draft-narajala-ans/)

### Platform Isolation
- [Reddit Architecture](https://www.reddit.com/r/redditdev/wiki/index)
- [Discord Architecture — ScyllaDB Migration](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [Slack Enterprise Key Management](https://slack.com/enterprise-key-management)
- [Slack Architecture](https://slack.engineering/)
- [Apple App Store Categories](https://developer.apple.com/app-store/categories/)

### Bucket Governance
- [Reddit Subreddit Creation History](https://www.reddit.com/r/TheoryOfReddit/)
- [Discord Server Discovery Requirements](https://support.discord.com/hc/en-us/articles/360023968311)
- [GitHub Namespace Model](https://docs.github.com/en/repositories)
- [Supabase Project Limits](https://supabase.com/docs/guides/platform/billing)

### Architecture
- Full distilled agent architecture spec: `shared/spec-eacp-distilled-agent-architecture.md`
- Distilled agent protocol analysis: `shared/research/distilled-agent-protocol-analysis.md`
- Platform isolation patterns: `shared/research/platform-isolation-patterns-for-eacp-buckets.md`

### Ephemeral Matching
- [Airbnb Calendar Blocking](https://www.airbnb.com/help/article/99)
- [Signal Double Ratchet](https://signal.org/docs/specifications/doubleratchet/)
- Ephemeral listing patterns: `shared/research/ephemeral-listing-patterns-within-bucket-matching.md`

### Cold Start
- [Uber Cold Start — Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-the-biggest-consumer-apps-got)
- [Airbnb Craigslist Strategy](https://growthhackers.com/growth-studies/airbnb)
- [Tinder Campus Launch](https://www.businessinsider.com/how-tinder-got-started-2015-3)
- Cold start analysis: `shared/research/marketplace-cold-start-bucket-model-analysis.md`

### Legal / PII Separation
- [GDPR Article 4(1) — Personal Data Definition](https://gdpr-info.eu/art-4-gdpr/)
- [Sweeney k-Anonymity (2002)](https://dataprivacylab.org/dataprivacy/projects/kanonymity/)
- [Narayanan & Shmatikov — Netflix De-anonymization](https://arxiv.org/abs/cs/0610105)
- PII separation analysis: `shared/research/pii-exchange-info-separation-legal-technical-research.md`
- Bucket governance models: `shared/research/bucket-governance-models-research.md`
