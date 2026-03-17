# Agentverse Implementation Plan

## Overview

This plan covers the full build from Phase 1 CLI MVP through Phase 4 ecosystem. Each phase builds on the previous — later phases cannot start until the preceding phase's foundations are in place.

```
Phase 1 (Weeks 1-6):   Agentverse CLI — push-share with BBS+ selective disclosure
Phase 2 (Weeks 7-14):  Delegate agents + encrypted transport + direct contact
Phase 3 (Weeks 15-22): Anonymous discovery + TEE matching + venue SDK
Phase 4 (Weeks 23-30): Reputation + tokens + multi-venue ecosystem
```

---

## Phase 1: Agentverse CLI (Weeks 1-6)

**Goal**: A working CLI tool that extracts a profile from LLM conversation history, issues BBS+ credentials, and pushes selectively-disclosed VPs to known agents.

### Week 1: BBS+ Proof-of-Concept (GATE)

This is a go/no-go gate. If BBS+ doesn't work within 5 days, fall back to Ed25519 per-attribute VCs.

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1 | Install Digital Bazaar stack, generate BLS12-381 key pair | Key pair generated, stored as JWK |
| 2 | Sign a hardcoded VC with bbs-2023 cryptosuite | Signed VC passes self-verification |
| 3 | Generate a derived proof with selective disclosure | VP contains proof revealing 3 of 10 claims |
| 4 | Verify the derived proof with a separate script | Independent verifier confirms proof |
| 5 | Write test suite against W3C BBS test vectors | All test vectors pass |

**Fallback plan**: If Digital Bazaar stack has blocking bugs, try MATTR WASM layer. If neither works in 5 days, switch to Ed25519 Data Integrity proofs with per-attribute VCs (loses cryptographic unlinkability but preserves selective disclosure at the VC level).

### Week 2: Profile Extraction Pipeline

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1-2 | Claude Code JSONL parser (streaming, DAG reconstruction) | Parses real ~/.claude/ history into NormalizedConversation[] |
| 3 | ChatGPT JSON parser (conversations.json, cycle detection) | Parses real ChatGPT export into NormalizedConversation[] |
| 4 | LLM extraction pipeline (chunk, extract, aggregate) + PII redaction filter (regex + spaCy patterns) | Structured profile with PII stripped before LLM sees data |
| 5 | Tier classification + coarsening pipeline ("Stripe" → "FAANG-tier fintech", "7 years" → "5-10 years") | Each attribute tagged with tier (0-4) and coarsened value |

**Output**: `agentverse extract` produces a tiered profile: exchange info (Tier 0-3) + PII vault (Tier 4). Two-column review shows included vs excluded.

### Week 3: Credential Wallet + VP Generation

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1 | `agentverse init` — key generation (BLS12-381 master + Ed25519 signing + recovery key export), did:jwk creation, full ~/.agentverse/ directory structure | All dirs created, encrypted keys stored, recovery key exported |
| 2 | Credential issuance — tiered profile → BBS+ signed VCs per tier (Tier 1-2 coarsened, Tier 4 PII vault) | `agentverse wallet issue` produces tier-separated VCs |
| 3 | VP generation — preset-based selective disclosure (minimal/professional/full) with tier-aware claim selection | VP contains derived proofs for only preset attributes at appropriate tier |
| 4 | Encrypted storage — AES-256-GCM with Argon2id for wallet + profile | All sensitive files encrypted at rest, passphrase-based unlock |
| 5 | Wallet CLI — `wallet list`, `wallet show`, `keys show`, `keys revoke` | All wallet commands work end-to-end |

### Week 4: A2A Client + Consent Manager

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1 | Agent Card fetcher — GET /.well-known/agent.json, JWS verification | Fetches and verifies real A2A Agent Cards |
| 2 | DID resolver — did:web for third-party agents, did:jwk for user | Resolves DID Documents and extracts public keys |
| 3 | A2A SendMessage — JSON-RPC 2.0, DataPart with VP payload | Successfully sends VP to mock agent |
| 4 | Consent Manager — interactive CLI prompts, JSON policy files, audit log | `share --with` prompts for consent, writes audit entry |
| 5 | Direct-contact policy schema — purpose-based allow/deny rules | Policy file controls which purposes are auto-approved/denied |

### Week 5: Mock Agent + Integration

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1-2 | Mock agent — Express server, serves Agent Card, accepts VPs, verifies BBS+ proofs | `agentverse share --with localhost:3000` works end-to-end |
| 3 | End-to-end integration test | extract → issue → share → verify complete flow passes |
| 4 | Error handling — network failures, invalid Agent Cards, corrupt credentials, timeout | All error paths produce clear user-facing messages |
| 5 | CLI UX polish — progress indicators, formatted output, help text | `agentverse --help` is clear; all commands have good UX |

### Week 6: Testing + Demo

| Day | Task | Success Criteria |
|-----|------|-----------------|
| 1-2 | Test suite — unit tests for each module, integration tests for full flow | >80% coverage on critical paths (wallet, VP gen, A2A) |
| 3 | Demo scenario — "Skills Portfolio" web page that verifies and displays a VP | Working demo: share VP, web page shows verified attributes |
| 4 | Documentation — README with quickstart, architecture overview, contribution guide | New user can install + run first share in <5 minutes |
| 5 | Release prep — npm package, CI/CD (GitHub Actions lint+test), version tagging | `npx agentverse init` works from npm |

---

## Phase 2: Delegate Agents + Encrypted Transport (Weeks 7-14)

**Goal**: Add bidirectional agent-agent communication with delegate agents, encrypted transport, and direct contact mode.

### Week 7-8: Delegate Agent Infrastructure

| Task | Details |
|------|---------|
| Delegate lifecycle manager | Spawn, monitor, terminate delegates. Track active delegates per relationship. |
| Typed schema IPC | Define the main-agent ↔ delegate protocol: `spawn(purpose, preset, peer_did)`, `escalate(attribute_name) → approve/deny`, `terminate()`. No natural language crosses this boundary. |
| Preset profiles | Define preset → attribute mappings. Delegate can only escalate within its preset. Main agent enforces immutably. |
| Relationship records | Local encrypted storage of ongoing relationship metadata (structured, no raw conversation). Delegates spawned with relationship context. |
| Direct contact handler | Receive structured contact_request at A2A endpoint. Deterministic triage (no LLM). Policy-based auto-approve/prompt/deny. |

### Week 9-10: Encrypted Transport

| Task | Details |
|------|---------|
| PQXDH handshake | Implement custom from EACP spec: 4 DH + 1 ML-KEM-768. Used for session establishment between delegates. |
| MLS sessions | OpenMLS integration for session encryption. Forward secrecy + post-compromise security. |
| Sign-then-encrypt | DIDComm v2 authcrypt pattern: JWS inner signature + age/ECDH outer encryption. Solves the sender authentication gap. |
| did:jwk → did:webvh migration | Implement identity evolution. `alsoKnownAs` linking. Re-issue VCs under new DID. |

### Week 11-12: CaMeL/FIDES Integration

| Task | Details |
|------|---------|
| Integrity labels | FIDES-style taint tracking: TRUSTED / VERIFIED / UNTRUSTED on all data in delegate context. |
| Restricted interpreter | CaMeL-style: delegate generates restricted code plans, main agent reviews. Variable indirection — main agent never sees raw conversation data. |
| Tiered risk model | Green (read) / Yellow (local) / Red (external). Red-tier actions with untrusted triggers always require human consent. |
| Prompt injection firewall | Schema enforcement + integrity checks on all inbound agent messages. Reject messages that don't match expected schemas. |

### Week 13-14: Referral System + Testing

| Task | Details |
|------|---------|
| Referral tokens | BBS+ VP from referrer containing referee, target, purpose, expiry. Verifiable, non-forgeable, non-reusable. |
| Doorbell Agent Card | Minimal public Agent Card with `open_to` categories. Serve at /.well-known/agent.json. |
| `agentverse contacts` | CLI for managing relationship records: list, show, revoke, export. |
| `agentverse persona create` | Create ephemeral did:jwk persona with scoped VCs for a specific purpose/venue. |
| Integration testing | Two local agents establish MLS session, exchange VPs bidirectionally, escalate attributes, maintain relationship records. |

---

## Phase 3: Discovery + TEE Matching (Weeks 15-22)

**Goal**: Agents find each other via encrypted search inside TEE clean rooms. The big unlock for recruiting, dating, cofounder search.

### Week 15-16: EACP L2 — Pre-Filter Search

| Task | Details |
|------|---------|
| Inverted index | Over Agent Card `open_to` fields + public metadata. <5ms query time. |
| HNSW index | 384-dim embeddings from BBS+ VP attributes. In-enclave vector search (10-30ms). |
| PSI eligibility gates | DH-based Private Set Intersection for mutual hard-constraint matching. |
| `agentverse discover` | Full implementation: submit persona to venue, receive match tiers. |

### Week 17-18: EACP L3 — TEE Clean Rooms

| Task | Details |
|------|---------|
| Nitro Enclave setup | AWS Nitro Enclave with KMS key release (PCR0+PCR3+PCR8). |
| Context pack ingestion | Encrypted profile vectors decrypted only inside enclave. |
| Scoring engine | Configurable: similarity, complementary, hybrid modes per venue. |
| Anonymous introduction | Venue-mediated PQXDH key exchange between matched parties. Neither learns the other's identity until mutual opt-in. |

### Week 19-20: Venue SDK

| Task | Details |
|------|---------|
| Venue SDK (Rust) | 7 interfaces: register, submit, search, match, introduce, audit, attestation. |
| Venue SDK (TypeScript bindings) | FFI wrapper for JS/TS venue operators. |
| WeKruit first-party venue | Reference implementation: recruiting venue with skills matching. |
| `agentverse match` | Full implementation: view match proposals, accept/reject, initiate conversation. |

### Week 21-22: Integration + Compliance

| Task | Details |
|------|---------|
| End-to-end discovery flow | Persona → venue → match → anonymous intro → delegate conversation → identity reveal. |
| VP revocation | `agentverse revoke --agent <domain>` — best-effort revocation notification + 90-day TTL backstop. |
| GDPR data export | `agentverse export --full` — profile + VCs + policies + audit log in signed archive. |
| DPA template | Standard EACP Venue Operator Agreement for GDPR compliance. |

---

## Phase 4: Ecosystem (Weeks 23-30)

**Goal**: Build the trust and incentive layer that makes the ecosystem self-sustaining.

### Week 23-24: Reputation Engine

| Task | Details |
|------|---------|
| 9-component reputation formula | Weighted: completion rate, response time, match quality, escalation rate, etc. |
| PageRank for Sybil resistance | Graph-based trust propagation across referral network. |
| Tessera anchoring | Reputation scores anchored to transparency log. |

### Week 25-26: Tokens + Incentives

| Task | Details |
|------|---------|
| Match receipts | Pedersen commitment-based match tokens, Tessera-anchored. |
| Venue stakes | Collateral-backed venue accountability with slashing conditions. |
| Cost model publication | Reference costs from WeKruit: cost per match, monthly fixed costs. |

### Week 27-28: Multi-Venue + Advanced Privacy

| Task | Details |
|------|---------|
| Multi-cloud TEE | SEV-SNP (Azure), TDX (GCP) alongside Nitro. TEE abstraction layer. |
| BBS+ V2 | Unlinkable proofs, ZK range predicates (Noir circuits). |
| Witness network | OmniWitness with 3-of-5 cosigning quorum for Tessera log. |

### Week 29-30: Agent SDK + Launch

| Task | Details |
|------|---------|
| Agent SDK (Rust) | For venue operators and third-party agent builders. |
| Agent SDK (TypeScript + Python) | Bindings for broader ecosystem. |
| Documentation | Full developer docs, API reference, integration guides. |
| Launch | npm package, Homebrew formula, demo agents, community outreach. |

---

## Key Decision Points

| When | Decision | Criteria |
|------|----------|---------|
| **End of Week 1** | BBS+ go/no-go | Can we sign, derive, and verify a BBS+ proof? If not → Ed25519 fallback |
| **End of Week 6** | Phase 1 ship? | End-to-end flow works: extract → issue → share → verify |
| **End of Week 10** | MLS viability | Can two delegates establish an encrypted session and exchange VPs? |
| **End of Week 18** | TEE viability | Can a Nitro Enclave ingest encrypted profiles and output match tiers? |
| **End of Week 22** | Phase 3 ship? | Full discovery flow works: persona → venue → match → conversation |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BBS+ library bugs | Medium | High | Week 1 gate. Ed25519 fallback designed. MATTR WASM as intermediate option. |
| JSON-LD canonicalization issues | High | Medium | Build custom canonicalization for MVP if needed. Standards compliance in Phase 2. |
| No third-party agents to connect to | High | High | Ship mock agent + demo integrations. Reframe Phase 1 as "portable cryptographic resume." |
| Nitro Enclave costs | Medium | Medium | Publish reference costs. Venue operators set own pricing. |
| IRTF BBS draft changes | Low | High | Pin library versions. Run test vectors in CI. Migration path documented. |
| MLS library maturity (OpenMLS) | Low | Medium | Apache-2.0, actively maintained. Fallback: Noise IK for pairwise only. |
| Delegate-to-main-agent escalation abuse | Medium | Medium | Preset-bounded escalation. Main agent uses immutable spawn-time purpose. |

## What's Already Built

| Component | Status |
|-----------|--------|
| Project scaffold (package.json, tsconfig, vitest) | Done |
| CLI skeleton (all commands registered, stubs working) | Done |
| CLI tests (3 passing) | Done |
| Architecture docs (RESEARCH_REPORT, MVP_SPEC, EACP whitepaper, 3 requirement docs) | Done |
| Debate synthesis | Done |

**Next action: Week 1, Day 1 — BBS+ proof-of-concept.**
