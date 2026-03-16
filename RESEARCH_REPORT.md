# Agentverse: Secure Agent-to-Agent Personal Context Sharing

## Architecture Design Report — Deep Dive

*Research Date: March 15, 2026*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Core Problem](#2-the-core-problem)
3. [Google A2A Protocol — Foundation Layer](#3-google-a2a-protocol--foundation-layer)
4. [Threat Model](#4-threat-model)
5. [Architecture Design](#5-architecture-design)
6. [Privacy Layer — Cryptographic Primitives](#6-privacy-layer--cryptographic-primitives)
7. [Prompt Injection Defense Architecture](#7-prompt-injection-defense-architecture)
8. [Trust & Identity Model](#8-trust--identity-model)
9. [Authorization & Consent Framework](#9-authorization--consent-framework)
10. [Sandboxing & Isolation](#10-sandboxing--isolation)
11. [MVP Implementation Roadmap](#11-mvp-implementation-roadmap)
12. [Appendix: Sources](#12-appendix-sources)

---

## 1. Executive Summary

This report presents the architecture for **Agentverse** — a system with two complementary layers:

1. **Agentverse CLI** (TypeScript) — A client-side tool that extracts a user's personal profile from LLM conversation history (Claude Code, ChatGPT, etc.) and enables privacy-preserving sharing via W3C Verifiable Credentials with BBS+ selective disclosure.
2. **EACP Protocol Layer** (Rust) — The Encrypted Agent Commons Protocol, a 6-layer protocol stack that enables agents to **discover, match, and transact** on behalf of their users without exposing raw personal data. This is where agent-agent connection happens — recruiters finding candidates, cofounders finding each other, dating matches, etc.

The Agentverse CLI is the **user-facing product**. EACP is the **underlying protocol** that governs how agents find each other and compute matches inside privacy-preserving clean rooms.

### Two-Layer Architecture

| Layer | What It Is | Language | Key Technology |
|-------|-----------|----------|----------------|
| **Agentverse CLI** | Client-side tool: profile extraction, credential wallet, consent, sharing | TypeScript | BBS+ VCs, A2A protocol, Commander.js |
| **EACP L0: Transport** | P2P mesh, hybrid PQ TLS, MLS session encryption | Rust | libp2p, OpenMLS (RFC 9420), aws-lc-rs |
| **EACP L1: Identity** | Self-certifying DIDs, transparency log, registry | Rust | did:jwk → did:webvh, Tessera, ed25519-dalek |
| **EACP L2: Discovery** | Privacy-preserving agent search (pre-filter → HNSW in TEE → PSI) | Rust | voprf, HNSW, Nitro SDK |
| **EACP L3: Compute** | TEE clean rooms for encrypted matching | Rust | AWS Nitro Enclaves, vsock, KMS |
| **EACP L4: Output** | BBS+ selective disclosure, ZK match proofs, TEE attestation | Rust | BBS+ (W3C), ed25519-dalek |
| **EACP L5: Tokens** | Reputation, match receipts, venue stakes | Rust | Pedersen commitments, Tessera |

The core design philosophy — learned from OpenClaw's catastrophic security failures — is: **push encrypted context out to apps, never pull agents into your data**. And the key architectural insight: **the best defense against data leakage is to never give the agent the sensitive data in the first place** (context minimization).

### Agent-Agent Discovery: The Missing Piece

Current agent protocols (A2A, MCP) support agent communication but not agent *discovery*. The use cases that matter — recruiting, dating, cofounder search — require agents to **find each other** based on encrypted attributes without exposing raw profiles. This is EACP Layers 2-3:

```
Current state:  User manually picks who to share with
                agentverse share --with ditto.ai

EACP vision:    Agents find each other via encrypted search
                "Find candidates with 5+ years Rust, open to startups"
                ...computed inside a TEE clean room, no one sees raw profiles
```

See [encrypted-agent-commons-whitepaper.md](encrypted-agent-commons-whitepaper.md) for the full EACP specification and [protocol-research-synthesis.md](protocol-research-synthesis.md) for the research validation.

---

## 2. The Core Problem

Users have spent hundreds of hours talking to LLMs. Those conversations contain a deep, implicit personal profile: skills, preferences, values, communication style, career history, interests. Today that context is:

- **Trapped** inside individual LLM providers
- **Not portable** between apps
- **Not privacy-preserving** — sharing means full exposure
- **Not verifiable** — no way to prove attributes without revealing everything

The system must solve all four problems simultaneously, while defending against:

- **External attackers** intercepting or tampering with agent communication
- **Malicious agents** trying to extract data beyond what's authorized
- **Prompt injection** where one agent manipulates another through crafted messages
- **The confused deputy problem** where a trusted agent is tricked into performing unauthorized actions

---

## 3. Google A2A Protocol — Foundation Layer

### Why A2A

A2A (v1.0, Linux Foundation, Apache 2.0) is the emerging standard for agent interoperability. Its governance includes AWS, Cisco, Google, IBM Research, Microsoft, Salesforce, SAP, and ServiceNow. It provides the communication substrate we need, but its security model has significant gaps we must fill.

### A2A Architecture (3 Layers)

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Protocol Bindings                         │
│  JSON-RPC 2.0 │ gRPC │ HTTP/REST                   │
├─────────────────────────────────────────────────────┤
│  Layer 2: Abstract Operations                       │
│  SendMessage │ GetTask │ CancelTask │ Subscribe     │
├─────────────────────────────────────────────────────┤
│  Layer 1: Canonical Data Model (Protobuf)           │
│  Tasks │ Messages │ Parts │ Artifacts │ Agent Cards │
└─────────────────────────────────────────────────────┘
```

### Key A2A Concepts We Build On

| Concept | What It Is | How We Extend It |
|---------|-----------|-----------------|
| **Agent Card** | JSON metadata at `/.well-known/agent.json` — name, endpoint, skills, auth schemes | Add mandatory JWS signing, DID anchoring, privacy policy declaration, capability constraints |
| **Task** | Stateful work unit (WORKING → COMPLETED/FAILED/CANCELED/REJECTED/INPUT_REQUIRED) | Add consent states: `USER_CONSENT_REQUIRED`, `PRIVACY_CHECK_REQUIRED` |
| **Message** | Communication turn with Parts (text, raw, url, data) | Enforce structured `data` Parts for inter-agent payloads — never raw text containing instructions |
| **Extensions** | Formal extension system (data-only, profile, method) with negotiation | Define privacy, consent, and security extensions |
| **Streaming** | SSE + push notifications for long-running tasks | Add encrypted streaming channels |

### Critical A2A Gaps We Must Fill

| Gap | Risk | Our Solution |
|-----|------|-------------|
| No mandatory Agent Card signing | Agent spoofing/impersonation | Mandatory JWS + DID verification |
| No message-level encryption | Data exposure if TLS is compromised | **Phase 2**: Sign-then-encrypt via DIDComm v2 authcrypt (bare age has no sender auth — deferred after adversarial review). MVP uses TLS. |
| No consent mechanism | Data shared without user approval | `USER_CONSENT_REQUIRED` task state + consent metadata |
| No prompt injection defense | Cross-agent manipulation | Data-minimized sharing (pipeline never has unauthorized data) + structured data only |
| No context minimization | Agent has more data than needed for a task | Sharing pipeline loads only approved credential files; enforced by module architecture |
| No fine-grained authorization | Over-sharing of data | ABAC with purpose-bound, time-limited, field-level controls |
| No audit trail | Cannot verify what was shared | Cryptographically signed interaction logs |
| No agent reputation | Cannot assess trustworthiness | Progressive trust model with on-chain attestations |

---

## 4. Threat Model

### Actors

| Actor | Description | Capability |
|-------|-------------|-----------|
| **User** | Person whose profile is being shared | Full control over their agent and data |
| **User's Agent** | Personal CLI agent extracting/managing profile | Trusted by user, runs locally |
| **Third-Party Agent** | App/service requesting user context (e.g., Ditto AI, WeKruit) | Semi-trusted, verified identity, limited access |
| **Malicious Agent** | Attacker posing as legitimate service | May spoof Agent Cards, inject prompts, exfiltrate data |
| **Network Attacker** | MitM on communication channel | Can intercept, modify, replay messages |
| **Compromised Agent** | Legitimate agent that has been taken over | Has valid credentials but malicious intent |

### Attack Taxonomy (Ranked by Severity)

1. **Cross-agent prompt injection** — Malicious agent embeds instructions in task descriptions/artifacts that manipulate the user's agent into revealing unauthorized data. *Success rate of roleplay-based injection: 89.6%.*
2. **Agent Card spoofing** — Fake agent advertises false capabilities to attract sensitive tasks. *No mandatory signing in base A2A.*
3. **Data exfiltration via tool abuse** — Agent tricks another into calling tools with sensitive data as parameters (markdown image exfil, HTTP callbacks).
4. **Memory poisoning** — Injected content corrupts the user agent's long-term memory, creating "sleeper" compromise. *Research demonstrates this in production systems.*
5. **Confused deputy** — Trusted agent tricked into performing privileged actions on behalf of an attacker. *Central security challenge of multi-agent AI (HashiCorp, Quarkslab).*
6. **Capability hijacking** — Compromised agent inflates skill advertisements to capture disproportionate task assignments.
7. **Cascading injection** — Malicious payload introduced in one agent's output propagates to all consuming agents. *Propagates faster than incident response can contain it.*

### OpenClaw: The Anti-Pattern

OpenClaw's catastrophic failure (25,000 GitHub stars in one day → 135,000 exposed instances → 1,184+ malicious skills) provides the exact blueprint of what NOT to do:

- Authentication was optional (we make it mandatory)
- Rate limiter exempted localhost (we apply limits universally)
- Skills ran with full host access (we sandbox everything)
- No skill vetting (we require signed Agent Cards + progressive trust)
- Agents pulled into user's data (we push encrypted context out)

---

## 5. Architecture Design

### Core Principle: Least-Context Architecture

> **The best way to prevent data leakage is to never give the agent the sensitive data in the first place.**

This principle — drawn from IsolateGPT (NDSS 2025), CaMeL (Google DeepMind), FIDES (Microsoft), and Apple Private Cloud Compute — drives the entire architecture. Rather than a single agent process with full profile access, we use **data-scoped sharing pipelines** where each interaction gets only the minimum data it needs.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           USER'S MACHINE                                  │
│                                                                          │
│  ┌──────────────┐    ┌────────────────────────────────────────────────┐  │
│  │   CLI Tool    │───▶│            ORCHESTRATOR (no profile data)      │  │
│  │  agentverse   │    │                                                │  │
│  └──────────────┘    │  Knows WHO to talk to, not WHAT to share.      │  │
│                      │  Never loads profile into its own context.      │  │
│  ┌──────────────┐    │                                                │  │
│  │ LLM History  │    │  ┌──────────────┐  ┌───────────────────────┐  │  │
│  │ Claude Code  │    │  │  Agent Card   │  │  Consent Manager      │  │  │
│  │ ChatGPT      │    │  │  Discovery &  │  │  (ABAC policies,     │  │  │
│  │ etc.         │    │  │  Verification │  │   decides WHAT can    │  │  │
│  └──────┬───────┘    │  └──────────────┘  │   be shared)          │  │  │
│         │            │                     └───────────┬───────────┘  │  │
│         │            │                                 │              │  │
│         │            │  Per-interaction, spawns:        │              │  │
│         │            │  ┌──────────────────────────────────────────┐  │  │
│         │            │  │  SCOPED AGENT INSTANCE (ephemeral)       │  │  │
│  ┌──────▼───────┐    │  │                                          │  │  │
│  │  Profile      │    │  │  Context contains ONLY:                 │  │  │
│  │  Extractor    │    │  │  - The 3 approved attributes            │  │  │
│  │  (offline)    │    │  │  - Recipient's public key               │  │  │
│  └──────┬───────┘    │  │  - Scoped task instructions              │  │  │
│         │            │  │                                          │  │  │
│  ┌──────▼───────┐    │  │  Not loaded (by module design):         │  │  │
│  │  Credential   │    │  │  - Full profile (no import path)        │  │  │
│  │  Wallet       │    │  │  - Other credentials (not requested)    │  │  │
│  │  (encrypted   │◄──┼──│  - Wallet keys (not passed via IPC)     │  │  │
│  │   at rest)    │    │  │  Note: code architecture, not OS        │  │  │
│  └──────────────┘    │  │  sandbox. Phase 2 adds enforcement.     │  │  │
│                      │  │                                          │  │  │
│                      │  │  ┌────────────┐  ┌───────────────────┐  │  │  │
│                      │  │  │ Privacy    │  │ A2A Client        │  │  │  │
│                      │  │  │ Engine     │  │ (send only,       │  │  │  │
│                      │  │  │ (VP gen)   │  │  send only)       │  │  │  │
│                      │  │  └────────────┘  └────────┬──────────┘  │  │  │
│                      │  └───────────────────────────┼─────────────┘  │  │
│                      └──────────────────────────────┼────────────────┘  │
│                                                     │                    │
└─────────────────────────────────────────────────────┼────────────────────┘
                                                      │
                          A2A Protocol over HTTPS      │
                          (E2E encryption: Phase 2)     │
                          + JWS-signed Agent Cards      │
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        THIRD-PARTY AGENTS                                 │
│                                                                          │
│  Agent Card includes:                                                    │
│    - keyAgreement: X25519 public key (Phase 2: sign-then-encrypt)        │
│    - DID, JWS signature, privacy policy, skills                          │
│                                                                          │
│  Receives ONLY:                                                          │
│    - VP with selective disclosure (HTTPS in MVP; E2E in Phase 2)          │
│    - Scoped token (purpose-bound, time-limited)                          │
│    - Cannot see A2A envelope content beyond routing metadata              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why Context-Scoped Instances (Not a Single Guardian)

| Single Guardian (old design) | Context-Scoped Instances (new design) |
|------------------------------|--------------------------------------|
| Guardian has full profile in context | Orchestrator never loads profile |
| If compromised, all data exposed | If compromised, only 3 approved attributes exposed |
| Must trust prompt injection defense | Doesn't need to — data isn't there to leak |
| One long-lived process | Ephemeral per-interaction, destroyed after |
| Shared memory across interactions | Isolated memory — Agent A's data can't reach Agent B |

This is inspired by:
- **IsolateGPT** (NDSS 2025): Hub-and-spoke model where isolated "spokes" get only needed data
- **Apple Private Cloud Compute**: Stateless computation, data exists only in memory during processing, leaves no trace
- **CaMeL** (Google DeepMind): Control flow (orchestrator) separated from data flow (scoped instance)
- **FIDES** (Microsoft): Taint labels track data provenance; variables referenced by ID, not injected as raw tokens

### Component Responsibilities

| Component | Role | Has Profile Access? |
|-----------|------|:-------------------:|
| **CLI Tool (`agentverse`)** | User interface — extraction, review, sharing, consent | No |
| **Orchestrator** | Agent discovery, consent evaluation, spawns scoped instances | No — only policy metadata |
| **Profile Extractor** | Reads LLM history, produces structured profile (offline, not during sharing) | Yes (extraction only) |
| **Credential Wallet** | Stores encrypted BBS+ signed VCs; releases specific VCs to scoped instances | Encrypted at rest |
| **Scoped Agent Instance** | Ephemeral per-interaction: generates VP, encrypts, sends via A2A | Only approved attributes |
| **Privacy Engine** | Within scoped instance: BBS+ selective disclosure, VP generation | Only approved attributes |
| **Consent Manager** | ABAC policy engine — decides what to share, with whom, for what purpose | No — only attribute names |
| **A2A Client** | Within scoped instance: Agent Card fetch, SendMessage (JSON-RPC 2.0) | Only the VP payload |

### Data Flow: Sharing Profile with Ditto AI (Example)

```
1. User runs: agentverse share --with ditto.ai --purpose dating-profile

2. ORCHESTRATOR (no profile data in context):
   ├── Fetches Agent Card from https://ditto.ai/.well-known/agent.json
   ├── Verifies JWS signature against did:web:ditto.ai:agent
   ├── Extracts keyAgreement public key (X25519) for E2E encryption
   ├── Checks trust level
   └── Reads requested attributes and privacy policy

3. CONSENT MANAGER (sees attribute names only, not values):
   ├── What attributes does Ditto request? (interests, age_range, location_city)
   ├── What purpose? (dating-profile)
   ├── What duration? (30 days)
   └── User approves via CLI prompt (or pre-authorized policy)

4. ORCHESTRATOR spawns SCOPED AGENT INSTANCE:
   ├── Requests only {interests, age_range, location_city} VCs from Wallet
   ├── Wallet decrypts and releases ONLY those 3 credential claims
   ├── Injects: approved claims + Ditto's X25519 public key + task instructions
   └── Instance has NO access to wallet, full profile, or other agents' data

5. SCOPED INSTANCE (isolated context with only 3 attributes):
   ├── Generates VP with BBS+ selective disclosure (only approved claims)
   ├── Signs plaintext VP with JWS
   ├── Sends A2A SendMessage: VP as DataPart over HTTPS (Phase 2: sign-then-encrypt)
   ├── Transport security: TLS 1.2+ (MVP); DIDComm v2 authcrypt (Phase 2)
   └── Instance is DESTROYED — no residual context

6. Ditto's agent:
   ├── Decrypts payload with its private key (only Ditto can decrypt)
   ├── Verifies BBS+ signatures
   ├── Uses disclosed attributes for profile creation
   └── Cannot access any undisclosed attributes

7. Audit log (on orchestrator, no profile data):
   └── "Shared {interests, age_range, location_city} with ditto.ai, expires 2026-04-14"
```

---

## 6. Privacy Layer — Cryptographic Primitives

### Phased Approach (MVP → Full)

The cryptographic privacy layer is built in three phases, ordered by implementation complexity and practical necessity:

### Phase 1: Verifiable Credentials + BBS+ Selective Disclosure (MVP)

**What**: Issue W3C VC 2.0 credentials over user profile attributes, signed with BBS+ signatures. The user's agent creates Verifiable Presentations that selectively disclose only requested attributes.

**Why BBS+ first**: Sub-millisecond verification, W3C standardized (`bbs-2023` cryptosuite), natively supports selective disclosure and unlinkable proofs, no ZK circuit development required.

**How it works**:
```
Profile Extraction          Credential Issuance           Selective Disclosure
┌──────────────┐           ┌───────────────────┐         ┌───────────────────┐
│ LLM History  │──extract─▶│ BBS+ signed VC    │──share─▶│ VP with only      │
│              │           │                   │         │ requested claims  │
│ "I have 7y   │           │ claims:           │         │                   │
│  Python exp, │           │  python_years: 7  │         │ Disclosed:        │
│  love hiking,│           │  hobbies: [hiking]│         │  python_years: 7  │
│  based in SF"│           │  city: SF         │         │                   │
│              │           │  age: 28          │         │ Hidden:           │
└──────────────┘           │  ...              │         │  hobbies, city,   │
                           └───────────────────┘         │  age, ...         │
                                                         └───────────────────┘
```

**Libraries** (updated after adversarial review):
- `@digitalbazaar/bbs-2023-cryptosuite` v2.0+ (primary — most aligned with W3C spec)
- `@digitalbazaar/bbs-signatures` v3.0+ (core BBS+ operations)
- `@digitalbazaar/bls12-381-multikey` (key management)
- MATTR WASM fallback if pure-JS performance exceeds targets by 5x+

### Phase 2: Zero-Knowledge Proofs for Predicate Verification

**What**: Build ZK circuits for proving predicates over profile attributes without revealing the underlying values.

**Why**: BBS+ handles selective disclosure ("show this field"), but ZKPs handle predicate proofs ("prove this field meets a condition"). Examples:
- "User has ≥5 years Python experience" without revealing the exact number
- "User is in the SF Bay Area" without revealing the exact city
- "User's interests overlap with {hiking, cooking, travel}" without revealing all interests

**Recommended framework**: **Noir** (Rust-like DSL, backend-agnostic via ACIR compilation, best developer experience, formal verification available via NAVe, used by ZKPassport for real-world attribute proofs).

**Performance**: For simple attribute predicates (comparisons, range proofs, set membership):
- Proof generation: **100ms–2s** on modern hardware
- Verification: **<1ms** (Groth16)
- Acceptable for agent-to-agent interactions that tolerate slight latency

**Circuit examples** (pseudocode):
```noir
// Prove experience >= threshold without revealing exact years
fn main(
    experience_years: Field,  // private witness
    threshold: pub Field,     // public input
    credential_hash: pub Field // public - links to VC
) {
    assert(experience_years >= threshold);
    assert(hash(experience_years) == credential_hash);
}
```

### Phase 3: Encrypted Computation (Future)

**What**: Enable third-party agents to compute on encrypted profile data (e.g., compatibility scoring on encrypted profiles).

**Options** (in order of current practicality):

| Approach | Best For | Latency | Library |
|----------|---------|---------|---------|
| **MPC (2-party)** | Joint computation between user agent + service | Seconds | CrypTen (PyTorch-native) |
| **MPC (N-party)** | Multi-agent collaboration | Seconds–minutes | MP-SPDZ (30 protocol variants) |
| **FHE** | Single-party computation on encrypted data | Minutes (improving) | Concrete ML (Zama) — Python, GPU-accelerated |

**Current reality**: FHE overhead is 10,000x–1,000,000x over plaintext on CPUs. Hardware acceleration (Intel Heracles: 5,000x speedup) is changing this, but not yet widely available. **MPC is more practical today for interactive use cases.**

**AgentCrypt tiered model** (NeurIPS 2025) provides the architectural guide:
1. Level 1: Unrestricted data exchange
2. Level 2: Encrypted transport (TLS — baseline)
3. Level 3: Selective disclosure with access controls ← **Our MVP**
4. Level 4: Full computation over encrypted data ← **Phase 3 target**

---

## 7. Defense Architecture: Context Minimization + Prompt Injection + P2P Security

### The Unified Principle

> **You can't leak what you don't have. You can't intercept what you can't decrypt. You can't inject into what doesn't process your input.**

These three threats — data leakage, eavesdropping, and prompt injection — are all addressed by the same architectural principle: **minimize the attack surface by minimizing what each component can access**.

### 7.1 Context Minimization (Primary Defense)

This is the **strongest** defense and the foundation of the entire security architecture. Rather than trying to prevent an agent from leaking data it has access to (which adaptive attacks bypass >90% of the time), we ensure the agent never has unauthorized data in the first place.

**Research basis**:
- **CaMeL** (Google DeepMind, 2025): Separates control flow from data flow; variables referenced by ID, not injected as raw tokens
- **IsolateGPT** (NDSS 2025): Hub-and-spoke model with <30% overhead; isolated spokes get only needed data
- **FIDES** (Microsoft, 2025): Taint labels on every value; deterministically blocks all policy-violating data flows
- **SEAgent** (January 2026): Mandatory access control for agents; 0% attack success rate across all tested vectors
- **Apple Private Cloud Compute**: Stateless computation; data exists only in memory during processing; even Apple staff cannot access it

**How it works in Agentverse**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONTEXT MINIMIZATION FLOW                        │
│                                                                     │
│  ORCHESTRATOR                    CREDENTIAL WALLET                  │
│  (no profile data)               (encrypted at rest)                │
│         │                               │                           │
│         │  1. Consent approved for      │                           │
│         │     {interests, age_range}    │                           │
│         │                               │                           │
│         │  2. Request ONLY those        │                           │
│         │     2 credential claims ────▶ │                           │
│         │                               │                           │
│         │  3. Wallet decrypts &         │                           │
│         │     releases ONLY those 2 ◀── │                           │
│         │                               │                           │
│         │  4. Spawn SCOPED INSTANCE     │                           │
│         │     with only:                │                           │
│         │     - interests claim         │                           │
│         │     - age_range claim         │                           │
│         │     - recipient's pubkey      │                           │
│         │     - "generate VP & send"    │                           │
│         ▼                               │                           │
│  ┌──────────────────────┐               │                           │
│  │ SCOPED INSTANCE       │               │                           │
│  │                       │               │                           │
│  │ CAN see:  2 claims   │  Even if fully compromised,               │
│  │ CAN do:   gen VP,    │  this pipeline can only leak              │
│  │           A2A send   │  {interests, age_range} — not             │
│  │                       │  the full profile.                        │
│  │                       │                                           │
│  │ NOT LOADED (by design):                                           │
│  │   wallet, full profile, other credentials                         │
│  │   (enforced by code architecture,                                 │
│  │    not OS sandbox — see Phase 2)                                  │
│  └──────────────────────┘                                           │
│         │                                                           │
│         │  5. VP generated, encrypted, sent                         │
│         │  6. Instance DESTROYED — zero residual context            │
└─────────┼───────────────────────────────────────────────────────────┘
          ▼
   A2A SendMessage (DataPart over HTTPS)
```

### 7.2 P2P Security (Outsiders Can't Listen In)

A2A mandates TLS but provides **no message-level encryption**. If TLS terminates at a CDN, load balancer, or reverse proxy, plaintext is exposed. Our P2P layer ensures only the intended recipient can read the payload.

**Phased approach**:

| Phase | Protocol | Properties | Use Case |
|-------|----------|-----------|----------|
| **MVP** | **HTTPS/TLS 1.2+** | Transport encryption, industry standard | All MVP communication |
| **Phase 2** | **DIDComm v2 authcrypt** (sign-then-encrypt) | Sender authentication + confidentiality, DIF standard | E2E encrypted agent communication |
| **Phase 2** | **MLS (RFC 9420)** | O(log N) group key ops, forward secrecy, post-compromise security | Multi-agent sessions, EACP transport |
| **Phase 2** | **Noise IK/XX** handshake | Mutual authentication, forward secrecy, session continuity | Repeated communication with trusted agents |

> **Note:** age E2E encryption was evaluated for MVP but deferred to Phase 2 after adversarial review found it provides confidentiality but no sender authentication (Critical gap). Phase 2 implements sign-then-encrypt via DIDComm v2 authcrypt. The design below shows the Phase 2 target architecture.

**Phase 2 target — E2E encrypted Data Parts**:

```
A2A Message (envelope in plaintext for routing):
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{
        "type": "data",
        "data": {
          "encrypted": true,
          "algorithm": "age-X25519",
          "ciphertext": "YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgy...",
          "recipientKeyId": "did:web:ditto.ai:agent#key-agreement-1"
        }
      }]
    }
  }
}
```

**Key discovery** requires zero additional round trips — piggybacked on Agent Card discovery:

```json
{
  "name": "ditto-ai-agent",
  "url": "https://ditto.ai/a2a",
  "did": "did:web:ditto.ai:agent",
  "keyAgreement": [{
    "id": "did:web:ditto.ai:agent#key-agreement-1",
    "type": "X25519KeyAgreementKey2020",
    "publicKeyMultibase": "z6LSbysY2xFMRpGMhb7tFTLMpeuPRaqaWM1yECx2AtzE3KCc"
  }],
  "skills": [...]
}
```

**Threat coverage**:

| Threat | TLS Only | TLS + age E2E |
|--------|----------|---------------|
| Network eavesdropper | Protected | Protected |
| Compromised CDN/load balancer | **EXPOSED** | Protected (can't decrypt payload) |
| Cloud provider memory inspection | **EXPOSED** | Protected (plaintext only in scoped instance) |
| DNS hijacking + fraudulent cert | **EXPOSED** | Protected (age uses recipient's key, not TLS cert) |
| Compromised proxy | **EXPOSED** | Protected (A2A envelope visible, payload encrypted) |

### 7.3 Prompt Injection Defense (Layered)

With context minimization as the primary defense, prompt injection becomes a **bounded-blast-radius** problem rather than a catastrophic one. Even if injection succeeds, the scoped instance only has the approved attributes.

**Layer 1 — Context Minimization** (structural, no AI involved):
- Scoped instance has only approved attributes — injection can't access what isn't there
- Instance is ephemeral — no persistent memory to poison
- No tools beyond VP generation and A2A send — can't exfiltrate via tool abuse

**Layer 2 — Structured Data Only** (protocol-level):
- All inter-agent payloads use A2A `data` Parts (structured JSON with schema validation)
- Free-text `text` Parts from external agents are rejected, never parsed as instructions
- Instructions and data travel in separate channels

**Layer 3 — Information Flow Control** (system-level, Phase 2):
- **FIDES-style taint labels**: Every value carries provenance metadata (who produced it, what policies apply)
- **SEAgent-style MAC**: Mandatory access control rules enforced at tool-call boundaries
- **CaMeL capability tokens**: Variables referenced by ID, not injected as raw content into LLM context

**Layer 4 — Agent Card Validation** (verification):
```
Fetch Agent Card → Verify JWS → Resolve DID → Check trust level
→ Validate skill descriptions against safe patterns → Accept/Reject
```

**Layer 5 — Output Validation** (defense in depth):
- All outbound data validated against consent policy before sending
- Canary tokens in profile data detect unauthorized exfiltration attempts
- No markdown/HTML rendering of external content (prevents image-based exfil)

**Why this is stronger than Dual LLM alone**: The Dual LLM pattern (privileged + quarantined LLM) is a good defense, but it still requires the privileged LLM to have access to the full profile. Our approach goes further — the orchestrator (which handles untrusted input like Agent Card discovery) **never has the profile data**. The scoped instance (which has some profile data) **never processes untrusted input** — it only generates and sends.

---

## 8. Trust & Identity Model

### Agent Identity: DIDs + Signed Agent Cards

Every agent in the ecosystem has a **Decentralized Identifier (DID)** that:
- Is self-controlled (no central authority)
- Contains no PII (privacy-preserving by design)
- Supports key rotation without a certificate authority
- Anchors the agent's A2A Agent Card

```
┌─────────────────────────────────────────────────┐
│                 Agent Card (Extended)             │
│                                                  │
│  Standard A2A fields:                            │
│    name, url, skills, capabilities,              │
│    authentication, extensions                    │
│                                                  │
│  Agentverse extensions:                          │
│    did: "did:web:ditto.ai:agent"                 │
│    signature: { /* JWS over entire card */ }     │
│    privacy_policy: {                             │
│      data_retention: "30d",                      │
│      purpose: ["dating-profile"],                │
│      third_party_sharing: false,                 │
│      deletion_endpoint: "/user-data/delete"      │
│    }                                             │
│    trust_level: "verified"                       │
│    attestations: [                               │
│      { issuer: "did:web:trustregistry.org",      │
│        type: "SecurityAuditPass",                │
│        date: "2026-03-01" }                      │
│    ]                                             │
│    required_credentials: [                       │
│      { type: "ProfileVC",                        │
│        claims: ["interests", "age_range"],        │
│        predicates: ["age >= 18"] }               │
│    ]                                             │
└─────────────────────────────────────────────────┘
```

### Progressive Trust Model (CSA Agentic Trust Framework)

Agents earn trust through demonstrated behavior, not just identity verification:

```
Level 0: UNKNOWN        — No interaction history, unverified Agent Card
    │                      Access: None
    ▼
Level 1: IDENTIFIED     — Valid DID, signed Agent Card, verified endpoint
    │                      Access: Can request public profile summary only
    ▼
Level 2: VERIFIED       — Security audit attestation, known operator
    │                      Access: Can request specific attributes via VP
    ▼
Level 3: TRUSTED        — Track record of compliant interactions, user approval
    │                      Access: Can request sensitive attributes, ZK proofs
    ▼
Level 4: PRIVILEGED     — Extended relationship, pre-authorized policies
                           Access: Can receive encrypted data for computation
```

**Promotion gates** (each level requires):
- Demonstrated accuracy in prior interactions
- Security audit passage (attestation from trusted auditor)
- Clean operational history (no policy violations)
- Explicit user approval for promotion

### Agent Discovery & Verification Flow

```
1. User requests: "share profile with ditto.ai"

2. Fetch Agent Card:
   GET https://ditto.ai/.well-known/agent.json

3. Verify signature:
   ├── Extract JWS from card
   ├── Resolve DID: did:web:ditto.ai:agent
   ├── Fetch DID Document (contains public keys)
   └── Verify JWS signature against DID public key

4. Check trust level:
   ├── Look up local trust store for prior interactions
   ├── Check attestations (security audit, known operator)
   └── Determine access level

5. If trust insufficient:
   ├── Inform user: "Ditto AI is at trust level IDENTIFIED (Level 1)"
   ├── Show: what they're requesting vs. what Level 1 allows
   └── User can: approve one-time exception, or promote trust level
```

---

## 9. Authorization & Consent Framework

### OAuth 2.1 with Agent Extensions

We adopt the emerging IETF standards for agent authorization:

- **`draft-oauth-ai-agents-on-behalf-of-user`**: Extends OAuth 2.0 Authorization Code Grant with `requested_actor` (identifies the agent) and `actor_token` (authenticates the agent). Resulting tokens capture user, agent, and client application identities.
- **AAuth (Agentic Authorization)**: OAuth 2.1 extension defining the Agent Authorization Grant.

### Token Design

```json
{
  "iss": "did:jwk:&lt;user-key&gt;",
  "sub": "did:web:ditto.ai:agent",
  "aud": "https://ditto.ai/a2a",
  "iat": 1710489600,
  "exp": 1713081600,
  "scope": "profile:read:interests,age_range,location_city",
  "purpose": "dating-profile",
  "purpose_binding": true,
  "delegator": "did:jwk:&lt;user-key&gt;",
  "actor": "did:web:ditto.ai:agent",
  "constraints": {
    "max_requests": 100,
    "no_third_party_sharing": true,
    "deletion_required_on_expiry": true
  }
}
```

### ABAC Policy Engine

The Consent Manager implements Attribute-Based Access Control:

```yaml
# Example policy: Ditto AI dating profile
policy:
  agent: "did:web:ditto.ai:agent"
  purpose: "dating-profile"

  allow:
    attributes:
      - interests
      - age_range          # range, not exact age
      - location_city
    predicates:
      - "age >= 18"        # ZK proof, no exact age

  deny:
    attributes:
      - exact_age
      - full_name
      - email
      - employment_history
      - salary
      - health_data

  constraints:
    duration: 30d
    max_requests: 100
    third_party_sharing: false
    retention_after_expiry: delete

  audit:
    log_all_access: true
    notify_on_anomaly: true
```

### Consent Flow

```
┌──────┐     ┌──────────────┐     ┌────────────┐     ┌────────────┐
│ User │     │ CLI (agentverse)│   │ Consent Mgr│     │ Third-Party│
└──┬───┘     └──────┬───────┘     └─────┬──────┘     └─────┬──────┘
   │                │                    │                   │
   │  share --with  │                    │                   │
   │  ditto.ai      │                    │                   │
   │───────────────▶│                    │                   │
   │                │  fetch Agent Card  │                   │
   │                │───────────────────────────────────────▶│
   │                │                    │   Agent Card      │
   │                │◀───────────────────────────────────────│
   │                │  evaluate policy   │                   │
   │                │───────────────────▶│                   │
   │                │  consent required  │                   │
   │                │◀───────────────────│                   │
   │  Ditto AI      │                    │                   │
   │  wants:        │                    │                   │
   │  - interests   │                    │                   │
   │  - age_range   │                    │                   │
   │  - location    │                    │                   │
   │  Approve? [y/n]│                    │                   │
   │◀───────────────│                    │                   │
   │  y             │                    │                   │
   │───────────────▶│  record consent    │                   │
   │                │───────────────────▶│                   │
   │                │  generate VP + ZKP │                   │
   │                │  + scoped token    │                   │
   │                │                    │                   │
   │                │  A2A SendMessage   │                   │
   │                │  (VP + proofs)     │                   │
   │                │───────────────────────────────────────▶│
   │                │                    │   Task: COMPLETED │
   │                │◀───────────────────────────────────────│
   │  Shared with   │                    │                   │
   │  Ditto AI ✓    │                    │                   │
   │◀───────────────│                    │                   │
```

---

## 10. Sandboxing & Isolation

### Agent Execution Isolation

When the user's agent processes responses from third-party agents, the quarantined LLM runs in an isolated environment:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Process isolation** | gVisor (user-space kernel) | Syscall interception, memory isolation — used by Anthropic for their web sandbox |
| **Network isolation** | Explicit allowlist | Only pre-approved endpoints reachable from quarantined zone |
| **Resource limits** | cgroups v2 | Hard CPU, memory, I/O limits — hypervisor terminates on exceed |
| **File system** | Read-only rootfs | Quarantined LLM cannot write to disk |

### Why gVisor Over Firecracker

For a CLI tool running on user machines, gVisor provides the best tradeoff:
- Fast startup (no full VM boot)
- Lower resource overhead than MicroVMs
- Strong isolation (dedicated user-space kernel per sandbox)
- Used by Anthropic at thousands of concurrent sandboxes
- Kubernetes-compatible for future cloud deployment

### Memory Isolation Between Sessions

Each interaction with a different third-party agent runs in a separate sandbox instance. No shared memory, no shared state, no cross-contamination. This prevents:
- Agent A's response from influencing Agent B's processing
- Cascading prompt injection across agent sessions
- Side-channel information leakage between agents

---

## 11. Implementation Roadmap — Unified 4-Phase Plan

### How Agentverse CLI and EACP Fit Together

```
Phase 1 (Weeks 1-6):     Agentverse CLI — the client product
Phase 2 (Weeks 7-14):    EACP L0-L1 — protocol foundation (transport, identity)
Phase 3 (Weeks 15-22):   EACP L2-L3 — agent discovery & matching (the big unlock)
Phase 4 (Weeks 23-30):   EACP L4-L5 — reputation, tokens, ecosystem
```

### Phase 1: Agentverse CLI — Client MVP (Weeks 1–6)

**Goal**: Extract profile from LLM history, issue BBS+ VCs, share via A2A with selective disclosure.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| CLI tool | `agentverse` command-line interface | TypeScript, Commander.js |
| Profile Extractor | Parse Claude Code JSONL + ChatGPT JSON → structured profile | TypeScript, Zod, stream-json |
| Credential Wallet | Issue BBS+ signed VCs over profile attributes | `@digitalbazaar/bbs-2023-cryptosuite`, `@digitalbazaar/vc` |
| VP Generation | Selective disclosure with preset profiles (minimal/professional/full) | W3C VC Data Integrity, BBS+ derived proofs |
| A2A Client | Agent Card discovery, JWS verification, SendMessage | jose, did-resolver, fetch |
| Consent Manager (v1) | Interactive CLI consent, JSON policies, append-only audit log | JSON, Node.js crypto |
| Mock Agent | Test/demo agent for end-to-end flow | Express/Fastify (100-200 LOC) |

**Identity**: `did:jwk` for user identity (no DNS dependency, EACP-compatible). Third-party agents use `did:web`.

**Security baseline**: Two-Pillar Defense (Data Minimization + Structured Data Only), mandatory JWS verification, HTTPS-only, profile encrypted at rest, self-issued credentials labeled "self-attested."

**VC schema**: Designed for EACP compatibility — categories map to EACP context pack fields.

### Phase 2: EACP Protocol Foundation (Weeks 7–14)

**Goal**: Build the protocol transport and identity layer. Upgrade from A2A-over-HTTPS to proper PQ-encrypted sessions.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| PQXDH handshake | Custom from spec: 4 DH + 1 ML-KEM-768 | ml-kem, x25519-dalek, ed25519-dalek (Rust) |
| MLS sessions | Session encryption with X-Wing ciphersuite | OpenMLS 0.7.2 (Apache-2.0) |
| Sign-then-encrypt | DIDComm v2 authcrypt (sender auth + confidentiality) | ECDH-1PU + AES-256-GCM |
| Identity registry | DID registration, key rotation, revocation | did:jwk genesis → did:webvh operational |
| Transparency log | Tessera personality for key bindings and sharing events | Trillian Tessera v1.0.2 (Go) |
| Injection firewall | Schema enforcement + quarantine + audit (layers 1, 3, 5) | Rust, Zod schema validation |
| CaMeL defense | Dual LLM pattern for bidirectional agent communication | Process-level isolation |
| `agentverse discover` | CLI command stub connecting to EACP registry | TypeScript → Rust FFI |

**Key upgrade**: E2E encryption via sign-then-encrypt (not bare age). MLS provides forward secrecy and post-compromise security.

### Phase 3: Agent Discovery & Encrypted Matching (Weeks 15–22)

**Goal**: The big unlock — agents find each other for recruiting, dating, cofounder search, etc.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| Pre-filter search | Inverted indexes over Agent Card fields (15 indexed fields, <5ms) | Rust |
| HNSW in TEE | Vector search inside AWS Nitro Enclave (384-dim embeddings, 10-30ms) | HNSW, Nitro SDK |
| PSI eligibility | DH-based Private Set Intersection for hard-constraint matching | voprf crate (RFC 9497) |
| TEE clean rooms | Nitro Enclaves with KMS key release (PCR0+PCR3+PCR8) | Nitro SDK, vsock, aws-lc-rs |
| Venue SDK | SDK for venue operators (WeKruit, Ditto AI) to build matching logic | Rust + TypeScript bindings |
| `agentverse discover` | Full agent discovery via encrypted search | TypeScript CLI → EACP L2 |
| `agentverse match` | Accept/reject match proposals, view match receipts | TypeScript CLI → EACP L3-L4 |

**This is the product differentiator**: No other protocol enables agents to find each other based on encrypted attributes, compute compatibility inside TEE clean rooms, and exchange verifiable match receipts — all without any party seeing raw profile data.

### Phase 4: Reputation, Tokens & Ecosystem (Weeks 23–30)

**Goal**: Build the trust and incentive layer that makes the ecosystem self-sustaining.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| Match tokens | Pedersen commitment-based match receipts, Tessera-anchored | curve25519-dalek, Tessera |
| Reputation engine | 9-component weighted formula + PageRank for Sybil resistance | Rust |
| Venue stakes | Collateral-backed venue accountability with slashing conditions | Tessera + governance panel |
| BBS+ V2 | Unlinkable proofs, ZK range predicates | BBS+ (IETF draft), Noir circuits |
| Multi-cloud TEE | SEV-SNP (Azure), TDX (GCP) alongside Nitro | TEE abstraction layer |
| Witness network | OmniWitness with 3-of-5 cosigning quorum | OmniWitness (Go) |
| Agent SDK | SDK for third-party agents to integrate with EACP | Rust + TypeScript + Python |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Two-product architecture** | Agentverse CLI (TS) + EACP Protocol (Rust) | CLI is the user product; EACP is the protocol layer. Different languages for different concerns. |
| **Start with BBS+ VCs, not ZKPs** | Phase 1 | BBS+ is standardized, sub-ms verification; ZKPs add predicates in Phase 4 |
| **did:jwk over did:web** | Phase 1 | Self-certifying, no DNS dependency, EACP-compatible; evolves to did:webvh in Phase 2 |
| **MLS over Signal Double Ratchet** | Phase 2 | Apache-2.0 license (Signal is AGPL), native multi-device, IETF standardized (RFC 9420) |
| **TEE search over crypto search** | Phase 3 | No open system achieves sub-100ms encrypted vector search; standard HNSW inside Nitro is the only viable MVP path |
| **Tessera over blockchain** | Phase 2 | Same auditability, no consensus overhead, $1,700/yr vs $100K+ for zkRollup |
| **Structured data only, no free text** | All phases | Eliminates the primary prompt injection vector |
| **Local-first architecture** | All phases | Profile and credentials never leave user's machine unless explicitly shared |
| **Context minimization as primary defense** | All phases | Agents should never have data they don't need — the best defense against leakage |

---

## 12. Appendix: Sources

### Google A2A Protocol
- [A2A Protocol Official Specification v1.0](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub Repository](https://github.com/a2aproject/A2A)
- [Google Developers Blog — A2A Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [Semgrep — A Security Engineer's Guide to A2A](https://semgrep.dev/blog/2025/a-security-engineers-guide-to-the-a2a-protocol/)
- [CSA — Threat Modeling A2A with MAESTRO Framework](https://cloudsecurityalliance.org/blog/2025/04/30/threat-modeling-google-s-a2a-protocol-with-the-maestro-framework)
- [Improving A2A Protocol: Protecting Sensitive Data (arXiv:2505.12490)](https://arxiv.org/html/2505.12490v3)

### Prompt Injection Research
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [CaMeL: Defeating Prompt Injections by Design (arXiv:2503.18813)](https://arxiv.org/abs/2503.18813)
- [Design Patterns for Securing LLM Agents (arXiv:2506.08837)](https://arxiv.org/abs/2506.08837)
- [OpenAI: The Instruction Hierarchy (arXiv:2404.13208)](https://arxiv.org/html/2404.13208v1)
- [Anthropic: Mitigating Prompt Injection in Browser Use](https://www.anthropic.com/research/prompt-injection-defenses)
- [Trail of Bits: Prompt Injection to RCE in AI Agents](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/)
- [MASpi: Multi-Agent System Prompt Injection Evaluation](https://openreview.net/forum?id=1khmNRuIf9)

### Cryptographic Primitives
- [W3C Verifiable Credentials 2.0](https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/)
- [W3C Data Integrity BBS Cryptosuites v1.0](https://www.w3.org/TR/vc-di-bbs/)
- [BBS Signatures — Privacy by Design (MATTR)](https://mattr.global/article/bbs-signatures---a-building-block-for-privacy-by-design)
- [Noir Documentation](https://noir-lang.org/docs/)
- [AgentCrypt: Privacy in AI Agent Collaboration (NeurIPS 2025)](https://arxiv.org/abs/2512.08104)
- [AI Agents with DIDs and VCs (arXiv:2511.02841)](https://arxiv.org/html/2511.02841v1)
- [Privacy Stack: ZK vs FHE vs TEE vs MPC Comparison](https://blockeden.xyz/blog/2026/01/27/privacy-infrastructure-zk-fhe-tee-mpc-comparison-benchmarks/)

### Agent Security Architecture
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [CSA Agentic Trust Framework](https://cloudsecurityalliance.org/blog/2026/02/02/the-agentic-trust-framework-zero-trust-governance-for-ai-agents)
- [Systems Security Foundations for Agentic Computing (arXiv:2512.01295)](https://arxiv.org/abs/2512.01295)
- [MiniScope: Least Privilege for Tool-Calling Agents (arXiv:2512.11147)](https://arxiv.org/abs/2512.11147)
- [Progent: Programmable Privilege Control (arXiv:2504.11703)](https://arxiv.org/abs/2504.11703)
- [HashiCorp: The Confused Deputy Problem in Agentic AI](https://www.hashicorp.com/en/blog/before-you-build-agentic-ai-understand-the-confused-deputy-problem)

### Authorization & Identity
- [IETF draft-oauth-ai-agents-on-behalf-of-user](https://datatracker.ietf.org/doc/draft-oauth-ai-agents-on-behalf-of-user/)
- [AAuth — Agentic Authorization (IETF)](https://datatracker.ietf.org/doc/html/draft-rosenberg-oauth-aauth-00)
- [Auth0: Access Control in the Era of AI Agents](https://auth0.com/blog/access-control-in-the-era-of-ai-agents/)
- [Keyfactor: PKI-Based Identity for Agentic AI](https://www.keyfactor.com/blog/3-things-to-know-about-keyfactors-pki-based-identity-for-agentic-ai/)

### OpenClaw & Security Incidents
- [OpenClaw Security Crisis (Dark Reading)](https://www.darkreading.com/application-security/critical-openclaw-vulnerability-ai-agent-risks)
- [ClawJacked Vulnerability (The Hacker News)](https://thehackernews.com/2026/02/clawjacked-flaw-lets-malicious-sites.html)
- [MCP Security Incidents Timeline (AuthZed)](https://authzed.com/blog/timeline-mcp-breaches)
- [LangGrinch CVE-2025-68664](https://thehackernews.com/2025/12/critical-langchain-core-vulnerability.html)

### Sandboxing
- [How to Sandbox AI Agents in 2026 (Northflank)](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [Edera: Securing Agentic AI with Hardened Runtime Isolation](https://edera.dev/stories/securing-agentic-ai-systems-with-hardened-runtime-isolation)
- [NVIDIA: Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
