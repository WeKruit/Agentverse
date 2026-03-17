# Distilled Agents: Synthesis of Team Research

**Date:** 2026-03-16
**Sources:** backend-report-004, frontend-report-004, infra-report-004, reference-spencer-conversation, ceo-review-001
**Status:** Synthesis complete

---

## Table of Contents

1. [What Are Distilled Agents?](#1-what-are-distilled-agents)
2. [How This Changes Everything](#2-how-this-changes-everything)
3. [The Distillation Pipeline](#3-the-distillation-pipeline)
4. [The Product: Clearroom CLI](#4-the-product-clearroom-cli)
5. [Bucket Architecture](#5-bucket-architecture)
6. [How This Addresses CEO Review Gaps](#6-how-this-addresses-ceo-review-gaps)
7. [Two-Minute Pitch Summary](#7-two-minute-pitch-summary)

---

## 1. What Are Distilled Agents?

The concept originated in a design session between Spencer and IndoClaw and was captured in `reference-spencer-conversation.md`. It is the architectural decision that transforms the Encrypted Agent Commons Protocol from a credentialing system into a personal intelligence platform.

### The Core Idea

A distilled agent is a minimal, sanitized proxy created from a user's LLM conversation history. It is not a full profile copy, not a forwarded chat log, and not a manually filled form. It is the result of a deliberate extraction and classification process that produces two outputs: an exchange information pack that enters the commons, and a PII vault that never leaves the user's device.

The agent enters the encrypted commons and acts on the user's behalf — matching, filtering, signaling interest — without exposing who the user is. The user remains pseudonymous throughout the matching phase. Identity is revealed only if and when the user chooses, after a mutual match has already been confirmed.

### What Goes Where

Spencer's framing was precise: communication context splits into two non-overlapping categories.

**Exchange info (non-PII)** is what the agent carries into the commons. This includes skills, work experience tiers, education tiers, budget ranges, hobbies, and preferences — the attributes another party needs in order to evaluate fit. These are the fields on which matching operates.

**PII info** is kept separate and never enters the commons. Full name, email address, phone number, physical address, and date of birth remain encrypted on the user's local machine (or in a user-controlled vault). They are revealed only after a mutual match has been confirmed and the user has given explicit, per-instance consent.

The security insight embedded in this split is significant: it is not merely a privacy measure. By ensuring that PII never enters the commons, the attack surface of the matching system is structurally reduced. There is no PII to exfiltrate from the commons because the commons never holds it.

### One Agent Per User Per Use Case

The architecture is O(NK): N users, each with up to K distilled agents, one per use-case bucket.

A user's job-seeking agent carries their engineering skills, experience level, preferred technologies, and salary band. Their dating agent carries personality attributes, hobbies, location preferences, and relationship goals. Their co-founder agent carries business domain knowledge, complementary skills sought, and equity preferences. These three agents share the same human origin but are cryptographically unlinkable — different pseudonymous identifiers, different keys derived via HKDF from the same master key.

This is not a coincidence of design. The unlinkability is intentional. A bad actor who observes the job-seeking agent and the dating agent cannot connect them to the same person. The K in O(NK) is a small constant — Spencer suggested 5-10 core buckets to start, expanding over time as the community develops new use cases, much like Reddit subreddits.

### Why Control Flows Through Distillation

The second key insight from Spencer's conversation is that the distillation point, not the transport layer, is where injection control happens. Once a distilled agent has been assembled from a user's conversation history and passed through the sanitization pipeline, it is a controlled, typed entity. It operates according to strict rules defined at distillation time. Even if the user's input conversations contained adversarial payloads — a prompt injection buried in a conversation history — the extraction process classifies facts, not raw text. The distilled agent communicates only through typed JSON schemas with `additionalProperties: false`. There is no free-form text field through which an injection payload can travel.

Spencer noted: "In the distill process, we may get prompt injected but I'm less concerned because we have more control." The backend team's research confirms this intuition. Type-directed privilege separation research shows that restricting inter-agent communication to int/float/bool/enum types achieves 0% attack success rate. The distilled agent is immune not because injection is detected, but because the protocol has no mechanism for delivering it.

### What a Distilled Agent Is Not

A distilled agent is not a chatbot. It does not hold conversations. It does not answer free-form questions. It is a structured representation of a person's relevant attributes for a specific context, capable of participating in a typed matching protocol, signaling interest in compatible counterparties, and escalating to human decision-making when a match is confirmed. The human user, not the agent, makes every high-stakes decision: whether to pursue a match, which PII fields to reveal, and whether to proceed to direct contact.

This is the fundamental user relationship: the agent works in the background, matching continuously, and surfaces results to the human. The human retains full control over what happens next.

---

## 2. How This Changes Everything

The distilled agent concept requires a revised architecture. The infra team produced the definitive updated protocol stack and a two-tier topology diagram showing how venues and buckets relate.

### 2.1 Revised Protocol Stack

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

Two new layers mark the distilled agent architecture. Layer 1.5 is the distillation pipeline, sitting between identity registration and discovery. Its output is the fundamental shift: the commons receives only exchange info; PII remains local. Layer 4.5 is the consent gate, ensuring that no automated system can trigger PII disclosure. The human decides, after seeing the match, which fields to share and with whom.

### 2.2 Key Architectural Changes from Whitepaper

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

The TEE simplification is meaningful beyond security. Because PII never enters the enclave, the TEE processes a smaller, faster data structure. The infra team benchmarks show ~410ms latency for distilled agent matching versus ~500ms for the full-profile model — an 18% reduction, and that reduction eliminates an entire class of PII leakage attacks rather than merely mitigating them.

### 2.3 Venues vs Buckets: Two-Tier Topology

The original whitepaper treated venues as the primary organizational unit. Distilled agents introduce a cleaner separation: venues are the access layer (operators who connect users to the commons), and buckets are the matching layer (namespaces that define schemas and run the matching engine).

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

The relationship is many-to-many. A venue can feed agents into multiple buckets. A bucket can receive agents from multiple venues. This is the structural insight that enables cross-venue matching: a user who signs up via WeKruit and a user who installed the open-source CLI can match in the same bucket, because both have distilled agents that conform to the same bucket schema. The venue boundary disappears at the matching layer.

---

## 3. The Distillation Pipeline

The backend team produced the definitive engineering specification for how a user's LLM conversation history becomes a distilled agent. The pipeline has seven steps, a four-layer PII detection system, a hybrid agent architecture that eliminates injection risk structurally, and a four-tier progressive revelation system with quantified re-identification risk analysis.

### 3.1 Pipeline Architecture

```
User's LLM History          Distilled Agent
(Claude JSONL /       ┌──────────────────────────┐
 ChatGPT JSON)        │                          │
       │              │  ┌──────────────────┐    │
       ▼              │  │ Exchange Info     │    │
┌─────────────┐       │  │ (cleartext)       │    │
│ EXTRACT     │       │  │ - skills[]        │    │
│ (Small LLM) │──────>│  │ - budget_range    │    │
│ GPT-4o-mini │       │  │ - hobbies[]       │    │
│ ~$1-2/1M tok│       │  │ - experience_tier │    │
└─────────────┘       │  │ - education_tier  │    │
       │              │  └──────────────────┘    │
       ▼              │                          │
┌─────────────┐       │  ┌──────────────────┐    │
│ CLASSIFY    │       │  │ PII Vault         │    │
│ PII vs      │──────>│  │ (encrypted)       │    │
│ Exchange    │       │  │ - full_name       │    │
└─────────────┘       │  │ - email           │    │
       │              │  │ - phone           │    │
       ▼              │  │ - address         │    │
┌─────────────┐       │  │ - DOB             │    │
│ SANITIZE    │       │  └──────────────────┘    │
│ Coarsen +   │       │                          │
│ k-anonymize │       │  Deterministic Core      │
└─────────────┘       │  (typed matching logic)  │
                      └──────────────────────────┘
```

### 3.2 The Seven-Step Pipeline

| Step | Tool | Input | Output | Cost |
|------|------|-------|--------|------|
| **1. Parse** | Custom parser | Claude Code JSONL / ChatGPT JSON export | Conversation turns (text) | Free |
| **2. Extract** | GPT-4o-mini or Gemini 2.0 Flash | Conversation turns | Structured JSON facts (Mem0-style ADD/UPDATE/DELETE) | ~$1-2 per 1M tokens |
| **3. PII Detect** | Multi-layer (see §3.3) | Extracted facts | Facts tagged as `exchange_info` or `pii` | ~$0.50 per 1K facts |
| **4. Coarsen** | Rule-based | Tagged exchange info | k-anonymized exchange info (e.g., "Stripe" → "FAANG-tier") | Free |
| **5. Schema Validate** | Pydantic / JSON Schema | Coarsened facts | Typed `DistilledAgentProfile` | Free |
| **6. Encrypt PII** | AES-256-GCM per-user key | PII facts | Encrypted PII vault | Free |
| **7. Deploy** | Registry API | Profile + encrypted vault | Live distilled agent in bucket | Free |

### 3.3 Multi-Layer PII Detection

No single PII detection tool achieves sufficient accuracy. The backend team's research shows that general-purpose tools miss 13.8-46.5% of PII entities when used alone. The recommended pipeline layers four methods to reduce missed PII to under 2%.

**Layer 1 — Regex/Pattern Matching** (deterministic, fast)
Handles structured formats: SSN patterns, Luhn-validated credit card numbers, RFC 5322 email patterns, phone numbers via libphonenumber. Accuracy approaches 100% for structured PII.

**Layer 2 — NER Model** (statistical, handles names and locations)
spaCy `en_core_web_trf` achieves 90.19% NER F1. Flair NLP reaches 92-98% F1 by entity type. Roblox's open-source PII classifier achieves 94% F1 with 98% recall and is specifically designed to resist adversarial inputs.

**Layer 3 — Presidio Orchestrator** (combines Layers 1 and 2)
Microsoft Presidio orchestrates NER, regex, and context analyzers in a single pipeline. Accuracy improves ~30% with tuning over vanilla configuration. Open source, actively maintained.

**Layer 4 — LLM Classifier** (final sweep for edge cases)
GPT-4o-mini or Claude Haiku reviews borderline cases that the preceding layers could not confidently classify. Catches implicit PII, coded references, and context-dependent identifiers. The critical policy: err toward classifying borderline cases as PII. False positives are safe; false negatives leak data.

### 3.4 Hybrid Agent Architecture

The key architectural decision for the distilled agent runtime is the hybrid deterministic-core/LLM-formatter pattern.

```
                    ┌─────────────────────────────┐
Incoming Message    │   Deterministic Core         │
(typed JSON) ──────>│   (Rust/WASM, no LLM)       │
                    │                              │
                    │   1. Parse typed message      │
                    │   2. Match against profile    │
                    │   3. Compute compatibility    │
                    │   4. Generate typed IR        │
                    │      (MatchResult struct)     │
                    │                              │
                    └───────────┬──────────────────┘
                                │
                    Typed Intermediate Representation
                    (score: 0.85, matched_skills: ["rust", "distributed"])
                                │
                    ┌───────────▼──────────────────┐
                    │   LLM Formatter (sandboxed)  │
                    │   (optional, for NL output)   │
                    │                              │
                    │   Input: typed IR only        │
                    │   Cannot see: PII, raw profile│
                    │   Output: validated JSON msg  │
                    └───────────┬──────────────────┘
                                │
                    ┌───────────▼──────────────────┐
                    │   Output Validator            │
                    │   Schema + PII scan + sign    │
                    └──────────────────────────────┘
```

The deterministic core makes all decisions. The LLM, if used at all, operates only on a typed intermediate representation that contains no PII and no raw profile data. This is the structural injection immunity described in §1: even if an adversary compromises the LLM formatter, it has no access to sensitive data and cannot exfiltrate anything meaningful. Research backing this pattern includes Type-Directed Privilege Separation (2025), which shows 0% attack success rate when quarantine outputs are restricted to typed primitives, and FIDES (Microsoft), which achieved 0 policy violations via information flow control.

### 3.5 The Re-Identification Problem and the Four-Tier Solution

The most important finding from the backend research is a counterintuitive one: **raw exchange info is not safe to publish, even without PII**.

The research draws on Sweeney (2000), which showed that ZIP code + date of birth + gender identifies 87% of the US population. De Montjoye (2013) showed that 4 spatiotemporal points identify 95% of people. Applied to engineer profiles: a combination like "5 years Rust + distributed systems + Stripe + UC Berkeley" carries approximately 48 bits of entropy — well above the 33 bits needed to uniquely identify a person among 8 billion. At k-anonymity, this profile has k=1 to k=5. It is virtually uniquely identifying.

The solution is a four-tier progressive revelation system in which matching operates on coarsened attributes and specifics are revealed only after mutual interest has been established.

| Tier | Visibility | Example | k-Anonymity Target | When Revealed |
|------|-----------|---------|-------------------|---------------|
| **Tier 0** | Public | Bucket category ("job-seeking") | k > 100,000 | Always visible |
| **Tier 1** | Within bucket | "Backend engineer, 3-7 years, Bay Area" | k > 1,000 | During matching |
| **Tier 2** | Matched pool only | "Rust, distributed systems, fintech" | k > 50 | After initial compatibility score > 0.7 |
| **Tier 3** | Post-mutual-interest | "Worked at Stripe, UC Berkeley CS" | k > 5 | After both agents signal interest |
| **Tier 4** | User-controlled | "Jane Smith, jane@email.com" | k = 1 (PII) | After explicit user consent via BBS+ selective disclosure |

Matching operates only on Tier 0 and Tier 1 data. Tier 1 is coarsened enough to maintain k > 1,000 — meaning any Tier 1 profile combination is shared by at least 1,000 people in the dataset, making individual identification infeasible. Tiers 2 and 3 are revealed progressively as mutual interest is confirmed. Tier 4 requires explicit user action at the consent gate.

The encryption architecture is layered to match:
- **Tier 1:** Cleartext (coarsened to k > 1,000, safe to publish)
- **Tier 2:** AES-256-GCM with venue-scoped key (HKDF from agent master key + venue_id)
- **Tier 3:** AES-256-GCM with ephemeral match-session key (created only when both agents signal interest)
- **Tier 4:** AES-256-GCM with user's master key; selective disclosure via BBS+ proofs for unlinkable presentation

---

## 4. The Product: Clearroom CLI

The frontend team designed the complete user-facing product. The CLI is called Clearroom. Its design philosophy is borrowed from 1Password (op:// URI scheme, biometric auth, Emergency Kit), Signal (encryption as the default, never explained), and Vercel (zero-config magic, optimistic UI). The key lesson from Bitwarden's failure — requiring users to manually export a session key to an environment variable — is explicitly avoided.

### 4.1 The ~/.clearroom/ Filesystem

```
~/.clearroom/
├── config.toml                    # Global configuration
├── profile.json                   # Extracted structured profile (encrypted at rest)
├── profile.md                     # Human-readable profile view (gitignored)
│
├── agents/                        # Distilled agents (one per bucket/context)
│   ├── recruiting.json            # Recruiting-context agent
│   ├── recruiting.key             # Agent-specific Ed25519 keypair
│   ├── dating.json                # Dating-context agent
│   ├── dating.key
│   ├── freelance.json             # Freelancing-context agent
│   └── freelance.key
│
├── keys/                          # Encryption keys
│   ├── profile.key                # Master profile key (AES-256-GCM)
│   ├── recovery.key               # Emergency recovery key (export on init)
│   └── venues/                    # Per-venue encryption keys
│       ├── wekruit.key
│       ├── matchlab.key
│       └── freelancehub.key
│
├── venues/                        # Venue connection state
│   ├── wekruit/
│   │   ├── attestation.json       # Venue's TEE attestation certificate
│   │   ├── config.toml            # Venue-specific overrides
│   │   └── published.json         # What's currently published to this venue
│   ├── matchlab/
│   └── freelancehub/
│
├── matches/                       # Match results and receipts
│   ├── active/                    # Current matches awaiting action
│   │   ├── match-1.json
│   │   └── match-2.json
│   ├── completed/                 # Matches where reveal happened
│   │   └── match-4.json
│   ├── expired/                   # Timed-out matches
│   └── receipts/                  # Cryptographic match receipts
│       └── receipt-match-1.cbor
│
├── reveals/                       # Identity reveal history
│   └── reveals.log                # Append-only log of all PII disclosures
│
├── cache/                         # Temporary extraction artifacts
│   └── extraction-2026-03-16.json # Raw extraction output (auto-purged after 24h)
│
└── logs/                          # Audit trail
    ├── operations.log             # All clearroom operations (hash-chained)
    └── attestations.log           # Venue attestation check results
```

Each distilled agent has its own Ed25519 keypair — one per bucket. Compromising one agent file does not compromise any other. Venue keys are isolated in `keys/venues/`: revoking a venue means deleting one file. The master profile is encrypted at rest and decrypted only in memory during operations. All operations are written to a hash-chained audit log; tampering is detectable. Extraction artifacts are auto-purged after 24 hours.

### 4.2 The 60-Second Onboarding Flow

The target is under 90 seconds from `brew install` to first match result. The best reference for this is 1Password CLI at ~60 seconds and Signal at ~90 seconds. The anti-reference is Bitwarden CLI at ~3 minutes, where the env-var session key is the primary friction point.

```
Step 1: INSTALL (10 sec)
  $ brew install clearroom
  # or: npm install -g @clearroom/cli
  # or: cargo install clearroom

Step 2: INIT + SCAN (20 sec)
  $ clearroom init
  → Scans ~/.claude/, chatgpt-export.json, ollama history
  → Progress bar: "Extracting profile from 847 conversations..."
  → Generates profile.json locally (encrypted, NEVER uploaded)
  → Shows confidence summary: 85 attributes, 6 categories

Step 3: REVIEW PROFILE (15 sec)
  $ clearroom profile
  → Beautiful tree-view of extracted attributes with confidence bars
  → User skims, optionally edits: `clearroom profile --edit`
  → KEY PRINCIPLE (from Signal): "Nothing to explain. It's encrypted. Always."

Step 4: DISTILL AGENT (10 sec)
  $ clearroom distill recruiting
  → Two-column view: Included (17 attrs) | Excluded (68 attrs)
  → "What This Agent Cannot Do" negative-capability box
  → User confirms with 'y'

Step 5: PUBLISH (5 sec)
  $ clearroom publish recruiting --venue wekruit
  → Encrypts agent → signs → publishes to WeKruit commons
  → "Published. Your agent is now discoverable on WeKruit."
  → Shows agent fingerprint for verification

Step 6: FIRST MATCH (~immediate for demo, <24h for real)
  $ clearroom matches
  → Shows match results with quality bars and criteria breakdown
  → THE AHA MOMENT: "Your agent matched 15/17 criteria with a company"
  → For onboarding: synthetic/demo match to show the experience immediately
```

The first three steps — install, init, profile review — are entirely local. No data is transmitted. No account is created. The user sees their extracted profile before being asked to do anything with it. This is a deliberate design choice: the profile itself is the first value delivery.

### 4.3 Distilled Agent UX: The Two-Column Distill View

The core trust mechanism is showing users both what is included and what is explicitly excluded. The excluded column is not hidden — it is shown on the same screen, equal in visual weight.

```
  INCLUDED IN AGENT (17)                   EXCLUDED — never shared (68)
  ─────────────────────────────────────    ─────────────────────────────
  [check] React / Next.js       0.97      [cross] Salary expectations
  [check] TypeScript            0.95      [cross] Dating preferences
  [check] System architecture   0.91      [cross] Political views
  [check] API design            0.88      [cross] Health information
  [check] 8+ years engineering  0.94      [cross] Personal relationships
  [check] Remote-first          0.96      [cross] Financial situation
  [check] High agency           0.93      [cross] Exact location
  ...17 total                              ...68 total
```

This follows the 1Password principle of making security visible rather than invisible. The user is not asked to trust that the system is protecting them — they can see the protection in action. 68 attributes are excluded; 17 are included. The proportion matters: most of what the system knows stays local.

### 4.4 The Five-Phase Post-Match Consent Gate

Modeled on Bumble's deliberate pause and Cerca's mutual reveal pattern:

```
PHASE 1: DISCOVERY (Anonymous)
  → Distilled agents matched inside TEE. Neither party knows identities.

PHASE 2: MATCH NOTIFICATION (Pseudonymous)
  → "Match with Agent #7f3a — 15/17 criteria. Quality: 94%"
  → Shows WHICH criteria matched (categories, not values)

PHASE 3: CONSENT GATE (Selective PII Reveal)
  → Each party independently toggles: [name] [email] [phone] [linkedin]
  → Nothing visible until BOTH parties submit selections
  → Asymmetric reveals OK (A shares name+email, B shares only name)
  → Reveal encrypted to counterparty's public key

PHASE 4: SIMULTANEOUS REVEAL
  → Both see each other's selections at the same moment
  → No first-mover disadvantage (Cerca pattern)
  → Reveal is permanent and logged

PHASE 5: CONVERSATION / HANDOFF
  → Parties communicate through Clearroom channel or transition to external
```

High-stakes actions require typing the word "reveal" in full, not confirming with y/N. This is borrowed from destructive operations in AWS CLI and Terraform: it forces deliberation at exactly the moment it matters.

### 4.5 Key Design Principles

1. Nothing leaves the machine until explicit publish. The first three steps are entirely local.
2. Every screen shows what is NOT shared. The Privacy block is persistent, not optional.
3. Encryption is the default, not a feature. Never ask "do you want to encrypt?" (Signal principle).
4. High-stakes actions require deliberate confirmation. Type "reveal", not y/N.
5. No dead ends. Every screen ends with "Next steps" or "What to do."
6. Trust through transparency. Show key fingerprints, attestation states, and algorithm choices. Make security visible.

---

## 5. Bucket Architecture

The infra team produced the definitive specification for bucket isolation, key management, creation governance, within-bucket matching, ephemeral listing design, and the cold start analysis.

### 5.1 Bucket Isolation Model

Buckets use a bridge model: shared physical infrastructure, per-bucket logical isolation and encryption. This is inspired by Slack Enterprise Key Management (per-workspace encryption keys), Discord (per-server member profiles with unlinkable identities), and Reddit (subreddit-scoped rules on shared database infrastructure).

| Isolation Dimension | Per-Bucket? | Rationale |
|--------------------|------------|-----------|
| **Encryption key** | Yes | Compromising one bucket's key leaves all other buckets intact |
| **HNSW matching index** | Yes | Domain-specific embedding models; limits breach blast radius |
| **Registry namespace** | Yes | Agents in different buckets have unlinkable DIDs |
| **Matching rules** | Yes | Each bucket defines its own exchange info schema + scoring algorithm |
| **TEE enclave** | Shared | Cost efficiency; bucket isolation enforced by key separation |
| **Tessera log** | Shared | Single transparency log with bucket_id as entry metadata |
| **Cross-bucket queries** | Denied by default | Opt-in only via BBS+ ZK proofs |

### 5.2 Four-Level Key Hierarchy

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

Epoch keys rotate hourly. When an epoch key is destroyed, all prior-epoch distilled agents become cryptographically unreadable — even if their ciphertext persists in caches or backups. This is forward-secure deletion: no explicit record destruction is required. The key destruction is the deletion.

### 5.3 Phased Bucket Creation Governance

| Phase | Timeline | Who Creates | Limit | Model |
|-------|----------|------------|-------|-------|
| **Phase 1** | Day 1 - Month 6 | Developers only | 50 buckets max | Early Reddit (admin-created subreddits) / App Store categories |
| **Phase 2** | Month 6 - Year 1 | Curated user creation | 500 buckets | Discord Server Discovery (creation open, listing gated) |
| **Phase 3** | Year 1+ | Open with governance | No hard cap | Mature Reddit (open creation, active moderation, cleanup) |

The Discord pattern is instructive: separate creation from discovery. Anyone can create a bucket (Phase 2+), but only buckets meeting activity and quality thresholds appear in search. Discord maintains 67% weekly-active servers versus Reddit's 3-4% active subreddits — the threshold-gated discovery model works.

### 5.4 Within-Bucket Matching Flow

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

### 5.5 Ephemeral Listing Design

| Property | Implementation |
|----------|---------------|
| **TTL** | Default 7 days, configurable per bucket (min 1 hour, max 30 days) |
| **Crypto-shredding** | Per-listing DEK. Destroy key = destroy listing, even if ciphertext persists in caches |
| **Epoch rotation** | Hourly epoch keys. Prior-epoch listings unreadable when epoch key destroyed |
| **Concurrent match prevention** | Enclave-serialized Compare-And-Swap (CAS) |
| **Confirmation timeout** | 5 minutes for automated agents, 24 hours for human-in-the-loop |
| **Replay prevention** | Nonces + epoch binding + TEE non-exfiltration guarantees |

### 5.6 Cold Start: How Buckets Convert a 4-Sided Problem to a 1-Sided Problem

This is the strategic insight that resolves the CEO review's chicken-and-egg critique.

| Dimension | Venue Model (Original) | Bucket Model (Spencer) |
|-----------|----------------------|----------------------|
| **Cold start type** | 4-sided platform (venues + supply + demand + more venues) | 1-sided community (users installing CLI) |
| **Network effects** | Per-venue only. Cross-venue: zero. | Per-bucket. Cross-source: positive. |
| **What you need first** | Venue developers to build apps | Users to create distilled agents |
| **Critical mass** | Multiple venues before protocol effects | One bucket with ~50-100 agents |
| **Comparable** | Launching the App Store (need apps + users) | Starting a Discord server (need members) |

In the venue model, you need WeKruit to succeed, then convince other developers to build apps, then convince their users to migrate. In the bucket model, you need 100 people to generate distilled agents via the CLI — and matching works immediately, regardless of how many venues exist. The CLI itself creates agents; venues are one source among several.

**Critical mass estimates by bucket type:**

| Bucket Type | Minimum Viable | Good Experience | Research Basis |
|-------------|---------------|----------------|---------------|
| **Recruiting (niche)** | 50 agents | 200+ agents | Job boards work with ~50 candidates per posting |
| **Recruiting (broad)** | 200 agents | 1,000+ agents | LinkedIn requires ~200 matches per search |
| **Dating (local)** | 300 agents | 1,000+ agents | Dating apps need geographic density |
| **Freelance** | 30 agents | 100+ agents | Upwork-style matching works with smaller pools |
| **Developer matching** | 20 agents | 100+ agents | Niche co-founder matching viable at 20 |

### 5.7 Twenty-Week Launch Playbook

| Phase | Weeks | Goal | Target Agent Count |
|-------|-------|------|--------|
| **1: CLI + Accumulation** | 1-8 | Ship CLI, accumulate agents with no marketplace. "Generate your encrypted developer profile." | 500 distilled agents created (no matching yet) |
| **2: First Bucket** | 9-12 | Launch `senior-swe-sf`. 100 agents enter. Prove matching works. | 100 active in bucket |
| **3: Expand** | 13-16 | Add 4 more buckets (dating, freelance, 2 more recruiting niches). Bridge imports from LinkedIn/GitHub. | 500 active across 5 buckets |
| **4: Organic Growth** | 17-20 | Self-sustaining organic growth. User-created buckets (Phase 2 governance). | 2,000+ active |

Phase 1 is critical: the CLI creates single-player value before any marketplace exists. The profile itself — a structured representation of everything you know about yourself extracted from your AI conversations — is valuable and shareable. Like Spotify Wrapped, it can be viral on its own merits. Users accumulate agents before matching launches; when Phase 2 activates, the pool is already warm.

---

## 6. How This Addresses CEO Review Gaps

The CEO review gave the protocol design 9/10 and the business plan 4/10. The core critique: "infrastructure looking for a customer, not a customer problem looking for a solution." The distilled agent architecture, the Clearroom CLI, and the bucket model collectively address every major gap the review identified.

### Critique 1: "Infrastructure looking for a customer"

**The gap:** The original whitepaper described a 6-layer protocol with no clear product entry point. The review said: "This reads like a PhD thesis looking for a commercial application."

**How distilled agents resolve it:** The Clearroom CLI is the product. The distilled agent is the value proposition that a non-technical user can understand and experience in 60 seconds. "Extract your AI conversations into a profile, control what each app sees, let your agent work for you privately" — that is a product pitch, not a protocol pitch. The protocol is the moat; the CLI is the door.

The CEO review imagined exactly this: "You install a CLI tool. It reads your Claude Code and ChatGPT conversations. In 30 seconds, it generates a structured personal profile more accurate than any LinkedIn profile you've ever built." That description maps precisely to `clearroom init` → `clearroom profile`.

### Critique 2: "Chicken-and-egg — one venue equals zero network effects"

**The gap:** The review identified that WeKruit as a single venue cannot create network effects. Other venues have no incentive to join if there is no user base. Users have no incentive to use the protocol if there is only one venue.

**How distilled agents resolve it:** Buckets need 50-100 agents, not multiple venues. The CLI creates agents independently of venues — a user installs the CLI and generates a distilled agent locally before any venue is involved. Venues are merely one delivery channel for agents into buckets. Organic CLI users form a second channel. Bridge imports (LinkedIn, GitHub) form a third.

The matching layer operates on agents, not venue memberships. When `senior-swe-sf` has 100 agents — sourced from WeKruit users, organic CLI users, and imported LinkedIn profiles — matching works regardless of whether there are 1 venue or 10 venues. The cold start problem shifts from "convince venue developers to build apps" to "convince engineers to generate a profile."

### Critique 3: "Product is buried under protocol — no clear user experience"

**The gap:** The whitepaper described PQXDH, OpenMLS, PSI, BBS+, Tessera, and DID methods in the first three sections. A user reading the whitepaper could not extract what they would actually do or see.

**How distilled agents resolve it:** The Clearroom CLI has a complete, concrete user experience designed before the protocol complexity is encountered. Step 1: `brew install clearroom`. Step 6: see your first match result. The underlying cryptography (HKDF-derived keys, AES-256-GCM, BBS+ proofs) is entirely invisible to the user. They see confidence bars, check/cross columns, a Privacy Status Block showing 36 attributes never shared with anyone. The protocol exists to make those assurances true; the CLI makes those assurances legible.

The CEO review said: "Lead with product. Protocol is the moat, not the pitch." The distilled agent architecture, with the CLI as its product surface, follows this exactly.

### Critique 4: "No clear aha moment — when does the user feel the value?"

**The gap:** The review argued that the product needed a single sentence that captures the transformative experience. Academic architecture documents do not have aha moments.

**How distilled agents resolve it:** The aha moment is specific and visceral:

> "My distilled agent got me a job interview I never applied for — and nobody saw my resume."

That sentence captures what actually happens: the agent matches on skills and experience, signals interest on the user's behalf, and surfaces the opportunity — all before the user's identity is disclosed. The user's name, email, and resume never enter the commons. A recruiter's agent matched with their agent on Tier 1 exchange info. Both parties confirmed interest. Then the user chose to reveal their name and email.

This is the opposite of applying to jobs. The agent works while the user does nothing. The match arrives. The user decides whether to proceed. The user's first reveal is chosen, not extracted.

The CEO review said: "The 10-star experience is 'your AI already knows you — now let it work for you, privately.'" The distilled agent architecture makes this technically precise, not merely aspirational.

---

## 7. Two-Minute Pitch Summary

### English

Most people build a LinkedIn profile once and let it go stale. But you've been having thousands of conversations with Claude, ChatGPT, and other AI tools — conversations that reveal your skills, your thinking style, your experience, your interests, in far more depth than any form you'd fill out manually.

Clearroom is a CLI tool that reads those conversations (with your permission), extracts a structured profile, and lets you control exactly what each application sees. It takes about 60 seconds from install to first result.

The core concept is the distilled agent. For each context — recruiting, dating, freelancing — you get a minimal, sanitized proxy: a representation of the relevant parts of yourself, stripped of PII, operating in an encrypted commons on your behalf. The agent matches continuously. Your name never enters the system. Your resume is never uploaded.

When your agent finds a counterpart — a company whose hiring agent matches yours on 15 of 17 technical criteria — you get a notification. You review it. You decide whether to proceed. If you do, you choose which fields to reveal: name, email, LinkedIn, or nothing. The other party makes the same choice simultaneously. Neither sees anything until both have decided.

This is not a protocol pitch. This is a product pitch. The protocol is the moat. The product is the agent. The aha moment is the one that looks like this: your agent got you a job interview you never applied for, and nobody saw your resume until you decided to show it.

The business starts with recruiting — the highest-value, most quantifiable bucket. One target demographic: senior software engineers in the Bay Area, who each generate enough LLM conversation history to produce a complete, accurate, verifiable professional profile in seconds. Critical mass for the first bucket is 50-100 agents. The twenty-week playbook gets there in the first three months, before expanding to dating, freelancing, and beyond.

The long game: every matching interaction generates a cryptographic receipt. Your reputation — who you matched with, how those interactions resolved — is portable, privacy-preserving, and mathematically verifiable. No platform owns it. You do.

---

### 中文（普通话）

大多数人只填过一次 LinkedIn，然后任由它慢慢过时。但你已经和 Claude、ChatGPT 以及其他 AI 工具进行了成千上万次对话——这些对话所揭示的关于你的技能、思维方式、工作经历和兴趣爱好的信息，比任何你手动填写的表格都要深入得多。

Clearroom 是一个命令行工具。经过你的授权，它读取这些对话，提取结构化的个人档案，并让你精确控制每个应用程序能看到什么。从安装到看到第一条匹配结果，大约只需要 60 秒。

核心概念是**蒸馏代理（distilled agent）**。针对每个使用场景——招聘、约会、接单——你会得到一个最小化的、经过净化的代理人：它代表你在当前场景下的相关信息，个人隐私已被剥离，在加密的公共空间中代你运作。代理持续进行匹配，你的真实姓名从不进入系统，你的简历从不被上传。

当你的代理找到对方——例如一家公司的招聘代理与你的代理在 17 项技术指标中吻合了 15 项——你会收到通知。你查看结果，决定是否继续。如果你决定继续，你可以选择透露哪些信息：姓名、邮件、LinkedIn 主页，或者什么都不透露。对方同时做出同样的选择。在双方都做出决定之前，谁也看不到任何东西。

这不是协议白皮书的推介，这是产品推介。协议是护城河，产品是代理人。那个让人恍然大悟的时刻是这样的：你的代理为你争取到了一次你从未主动申请的面试机会——而且在你主动决定展示之前，没有人看过你的简历。

商业化从招聘场景起步——价值最高、最容易量化的方向。核心目标用户：旧金山湾区的高级工程师。他们积累了足够丰富的 AI 对话历史，可以在几秒钟内生成完整、准确、可验证的职业档案。第一个 bucket 的临界规模是 50 到 100 个代理。二十周的行动计划在前三个月内实现这一目标，之后扩展到约会、接单及更多场景。

长期愿景：每次匹配互动都会生成一份加密收据。你的声誉——你与谁匹配过、那些互动如何收场——是可以携带的、保护隐私的、在数学上可验证的。没有任何平台拥有它，你才是主人。

---

*Synthesis document compiled from: backend-report-004.md, frontend-report-004.md, infra-report-004.md, reference-spencer-conversation.md, ceo-review-001.md*
*All ASCII diagrams reproduced verbatim from source reports.*
