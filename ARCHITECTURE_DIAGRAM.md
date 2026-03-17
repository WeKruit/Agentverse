# Agentverse Architecture Diagram

## Full System Overview

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                           ALICE'S MACHINE                                    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────────┐  ║
║  │                        AGENTVERSE CLI (TypeScript)                      │  ║
║  │                                                                         │  ║
║  │  Commands: init | extract | profile | wallet | share | audit            │  ║
║  │            agents | keys | discover* | match* | contacts* | persona*   │  ║
║  │                                                        (* = Phase 2-3)  │  ║
║  └──────┬──────────┬──────────┬──────────┬──────────┬─────────────────────┘  ║
║         │          │          │          │          │                         ║
║         ▼          ▼          ▼          ▼          ▼                         ║
║  ┌───────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────────────┐    ║
║  │  Profile   │ │Credent.│ │Consent │ │  A2A   │ │    MAIN AGENT        │    ║
║  │  Extractor │ │ Wallet │ │Manager │ │ Client │ │    (P-LLM)           │    ║
║  │            │ │        │ │        │ │        │ │                      │    ║
║  │ Claude Code│ │ BBS+   │ │ JSON   │ │ Agent  │ │ Has: full profile    │    ║
║  │ ChatGPT   │ │ VCs    │ │ policy │ │ Card   │ │ NEVER talks to       │    ║
║  │ → profile │ │ per-   │ │ audit  │ │ fetch  │ │ outside directly     │    ║
║  │           │ │ tier   │ │ log    │ │ JWS    │ │                      │    ║
║  └─────┬─────┘ └───┬────┘ └───┬────┘ └───┬────┘ │ Manages:             │    ║
║        │           │          │          │      │ - delegate lifecycle  │    ║
║        ▼           ▼          ▼          ▼      │ - consent decisions   │    ║
║  ┌─────────────────────────────────────────────┐│ - filesystem creation │    ║
║  │              ~/.agentverse/                  ││ - preset enforcement  │    ║
║  │                                              │└──────────┬───────────┘    ║
║  │  profile.json.enc    (AES-256-GCM)          │           │                 ║
║  │  keys/               (BLS12-381 + Ed25519)  │           │ spawns          ║
║  │  agents/             (per-bucket distilled)  │           │ per-interaction ║
║  │  credentials/        (BBS+ VCs, per-tier)   │           ▼                 ║
║  │  venues/             (attestations, config)  │ ┌─────────────────────┐    ║
║  │  matches/            (active, completed)     │ │  DELEGATE            │    ║
║  │  relationships/      (structured records)    │ │  (ephemeral)         │    ║
║  │  policies/           (consent rules)         │ │                     │    ║
║  │  audit/              (hash-chained log)      │ │  Read-only           │    ║
║  │  did/                (did:jwk document)      │ │  filesystem with:    │    ║
║  │  cache/              (Agent Cards, DIDs)     │ │                     │    ║
║  └──────────────────────────────────────────────┘ │  structured: {}     │    ║
║                                                    │  evaluable_text: {} │    ║
║                                                    │  human_only: {}     │    ║
║                                                    │                     │    ║
║                                                    │  NO tools           │    ║
║                                                    │  NO network         │    ║
║                                                    │  NO wallet access   │    ║
║                                                    └──────────┬──────────┘    ║
║                                                               │               ║
╚═══════════════════════════════════════════════════════════════╪═══════════════╝
                                                                │
                    ┌───────────────────────────────────────────┘
                    │
                    ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          COMMUNICATION LAYER                                 ║
║                                                                              ║
║  ┌───────────────────────────────────────────────────────────────────────┐   ║
║  │                                                                       │   ║
║  │  PHASE 1 (MVP):  A2A Protocol over HTTPS                             │   ║
║  │                  Push-only: VP as DataPart via SendMessage            │   ║
║  │                  No conversation. No bidirectional flow.              │   ║
║  │                                                                       │   ║
║  │  PHASE 2:        MLS Encrypted Sessions (RFC 9420)                   │   ║
║  │                  PQXDH handshake (X25519 + ML-KEM-768)               │   ║
║  │                  Sign-then-encrypt (DIDComm v2 authcrypt)            │   ║
║  │                  Forward secrecy + post-compromise security          │   ║
║  │                                                                       │   ║
║  └───────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
╚════════════════════════╤══════════════════════════╤══════════════════════════╝
                         │                          │
            ┌────────────┘                          └────────────┐
            │                                                    │
            ▼                                                    ▼
╔═══════════════════════════════╗          ╔═══════════════════════════════════╗
║  MODE 1: DIRECT CONTACT (1:1)║          ║  MODE 2: ANONYMOUS DISCOVERY (1:N)║
║  (Phase 2)                    ║          ║  (Phase 3)                        ║
║                               ║          ║                                   ║
║  ┌─────────────────────────┐  ║          ║  ┌─────────────────────────────┐  ║
║  │  Alice's Doorbell       │  ║          ║  │  BUCKET (purpose namespace)  │  ║
║  │  Agent Card             │  ║          ║  │  e.g., senior-swe-sf        │  ║
║  │                         │  ║          ║  │                             │  ║
║  │  name + DID + endpoint  │  ║          ║  │  Agents from multiple       │  ║
║  │  open_to: [recruiting]  │  ║          ║  │  venues (WeKruit, CLI,      │  ║
║  │  (nothing else)         │  ║          ║  │  LinkedIn Bridge)           │  ║
║  └────────────┬────────────┘  ║          ║  └──────────────┬──────────────┘  ║
║               │               ║          ║                 │                 ║
║  Bob sends    │ structured    ║          ║  Alice submits  │ encrypted       ║
║  contact_req  │ (no free text)║          ║  ephemeral      │ context pack    ║
║               ▼               ║          ║  persona        │ (Tier 1-2      ║
║  ┌─────────────────────────┐  ║          ║  (own did:jwk)  │  coarsened)    ║
║  │  Deterministic Triage   │  ║          ║                 ▼                 ║
║  │  (NO LLM)               │  ║          ║  ┌─────────────────────────────┐  ║
║  │                         │  ║          ║  │  TEE CLEAN ROOM             │  ║
║  │  Verify DID             │  ║          ║  │  (AWS Nitro Enclave)        │  ║
║  │  Check purpose vs policy│  ║          ║  │                             │  ║
║  │  Check requested topics │  ║          ║  │  1. Pre-filter (<5ms)       │  ║
║  │  Auto-approve/prompt/   │  ║          ║  │  2. HNSW search (10-30ms)   │  ║
║  │  deny                   │  ║          ║  │  3. PSI eligibility gates   │  ║
║  └────────────┬────────────┘  ║          ║  │  4. Deterministic scoring   │  ║
║               │               ║          ║  │                             │  ║
║  If approved: │               ║          ║  │  Outputs ONLY: match tier   │  ║
║               ▼               ║          ║  │  (A-F). No raw data exits.  │  ║
║  ┌─────────────────────────┐  ║          ║  └──────────────┬──────────────┘  ║
║  │  FILESYSTEM-DELEGATE    │  ║          ║                 │                 ║
║  │  EVALUATION             │  ║          ║  Both parties:  │                 ║
║  │                         │  ║          ║  "Tier A match  │                 ║
║  │  Alice's delegate reads │  ║          ║   with Agent    │                 ║
║  │  Bob's filesystem.      │  ║          ║   #7f3a"        │                 ║
║  │  Bob's delegate reads   │  ║          ║                 │                 ║
║  │  Alice's filesystem.    │  ║          ║  Anonymous intro│                 ║
║  │                         │  ║          ║  via venue-     │                 ║
║  │  Both score and report  │  ║          ║  mediated PQXDH │                 ║
║  │  to their own human.    │  ║          ║                 │                 ║
║  └─────────────────────────┘  ║          ╚═════════════════╧═════════════════╝
║                               ║
╚═══════════════════════════════╝


              MODE 3: REFERRAL (any phase)
              Carol issues BBS+ VP referral token
              (referee + target + purpose + expiry)
              Elevates contact request priority
```

## Delegate Filesystem & Evaluation Detail

```
╔═════════════════════════════════════════════════════════════════════════════╗
║                     DELEGATE FILESYSTEM (three tiers)                      ║
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐    ║
║  │  TIER 1: structured          (enum-only, from fixed taxonomy)      │    ║
║  │                                                                    │    ║
║  │  skills: ["rust", "ml", "distributed-systems"]                     │    ║
║  │  experience_band: "5-10yr"                                         │    ║
║  │  values: ["autonomy", "impact", "climate"]                         │    ║
║  │  location_region: "US-West"                                        │    ║
║  │  availability: "full-time"                                         │    ║
║  │  looking_for: ["biz-cofounder"]                                    │    ║
║  │                                                                    │    ║
║  │  → LLM scores directly. ZERO injection surface.                    │    ║
║  └────────────────────────────────────────────────────────────────────┘    ║
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐    ║
║  │  TIER 2: evaluable_text      (free text that IS the signal)        │    ║
║  │                                                                    │    ║
║  │  essay: "The first time I debugged a distributed system..."        │    ║
║  │  vision: "We're building privacy infrastructure for..."            │    ║
║  │  project_desc: "Built a payment pipeline serving 10M req/day"      │    ║
║  │                                                                    │    ║
║  │  → Processed through 6-layer defense stack before scoring:         │    ║
║  │                                                                    │    ║
║  │    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    ║
║  │    │1.Sanitize│→ │2.Encode  │→ │3.Extract │→ │4.Score   │        │    ║
║  │    │PromptArmr│  │Base64    │  │struct    │  │dimension │        │    ║
║  │    │<1% miss  │  │~0% inj. │  │facts     │  │enum vals │        │    ║
║  │    └──────────┘  └──────────┘  └──────────┘  └────┬─────┘        │    ║
║  │                                                    │              │    ║
║  │    ┌──────────┐  ┌──────────┐                     │              │    ║
║  │    │5.Validate│← │6.Human   │←────────────────────┘              │    ║
║  │    │anomaly   │  │sees score│                                     │    ║
║  │    │detection │  │+ raw text│                                     │    ║
║  │    └──────────┘  └──────────┘                                     │    ║
║  └────────────────────────────────────────────────────────────────────┘    ║
║                                                                            ║
║  ┌────────────────────────────────────────────────────────────────────┐    ║
║  │  TIER 3: human_only          (never touched by any LLM)            │    ║
║  │                                                                    │    ║
║  │  recommendations: [...]                                            │    ║
║  │  full_transcript: {...}                                            │    ║
║  │  portfolio_links: [...]                                            │    ║
║  │                                                                    │    ║
║  │  → Shown to human post-match ONLY. No LLM processing.             │    ║
║  └────────────────────────────────────────────────────────────────────┘    ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

## The 4-Tier Progressive Revelation System

```
╔══════════════════════════════════════════════════════════════════════════╗
║                     PROGRESSIVE REVELATION                              ║
║                                                                         ║
║  DISTILLATION PIPELINE (Layer 1.5)                                      ║
║                                                                         ║
║  Raw LLM History                                                        ║
║       │                                                                 ║
║       ▼                                                                 ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │  EXTRACT → CLASSIFY → COARSEN → SPLIT                           │   ║
║  └──────┬────────────┬────────────┬────────────┬───────────────────┘   ║
║         │            │            │            │                        ║
║         ▼            ▼            ▼            ▼                        ║
║  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐              ║
║  │  TIER 0   │ │  TIER 1   │ │  TIER 2   │ │  TIER 3   │   TIER 4    ║
║  │           │ │           │ │           │ │           │   ┌───────┐  ║
║  │ "job-     │ │ "Backend  │ │ "Rust,    │ │ "Stripe,  │   │ PII   │  ║
║  │  seeking" │ │  3-7 yrs  │ │  distrib, │ │  UC       │   │ VAULT │  ║
║  │           │ │  Bay Area"│ │  fintech" │ │  Berkeley"│   │       │  ║
║  │ k>100,000 │ │ k>1,000   │ │ k>50      │ │ k>5       │   │ k=1   │  ║
║  │           │ │           │ │           │ │           │   │       │  ║
║  │ Always    │ │ During    │ │ Post-score│ │ Post-     │   │ BBS+  │  ║
║  │ visible   │ │ matching  │ │ >0.7      │ │ mutual    │   │ only  │  ║
║  │           │ │           │ │           │ │ interest  │   │       │  ║
║  └───────────┘ └───────────┘ └───────────┘ └───────────┘   └───────┘  ║
║       │              │              │             │            │        ║
║       │              │              │             │            │        ║
║       ▼              ▼              ▼             ▼            ▼        ║
║   Bucket ID     TEE matching    Post-match    Post-mutual   User       ║
║   (public)      (inside TEE)    reveal        interest      consent    ║
║                                                             gate       ║
╚═════════════════════════════════════════════════════════════════════════╝
```

## EACP Protocol Stack

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        EACP PROTOCOL LAYERS                             ║
║                                                                         ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │  L0: TRANSPORT                                                   │   ║
║  │  P2P mesh · Hybrid PQ TLS · MLS session encryption               │   ║
║  │  Tech: libp2p, OpenMLS (RFC 9420), aws-lc-rs                    │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L1: IDENTITY                                                    │   ║
║  │  Self-certifying DIDs · Transparency log · Registry              │   ║
║  │  Tech: did:jwk → did:webvh, Tessera, ed25519-dalek              │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L1.5: DISTILLATION                                              │   ║
║  │  Extract → Classify (PII vs exchange) → Coarsen → Assemble      │   ║
║  │  PII never enters commons. 5-layer injection firewall.           │   ║
║  │  Tech: Multi-layer PII detection, k-anonymity, Spotlighting     │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L2: DISCOVERY                                                   │   ║
║  │  Bucket-based agent search · Pre-filter → HNSW in TEE → PSI     │   ║
║  │  Within purpose-specific namespaces (buckets)                    │   ║
║  │  Tech: voprf, HNSW, Nitro SDK                                   │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L3: CONFIDENTIAL COMPUTE                                        │   ║
║  │  TEE clean rooms matching on EXCHANGE INFO ONLY (no PII)         │   ║
║  │  Tech: AWS Nitro Enclaves, vsock, KMS                            │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L4: VERIFIABLE OUTPUT                                           │   ║
║  │  Match receipts · TEE attestation · Tessera transparency log     │   ║
║  │  Tech: ed25519-dalek, Tessera                                    │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L4.5: CONSENT GATE                                              │   ║
║  │  Human-in-the-loop PII reveal decision                           │   ║
║  │  No automated disclosure. Type "reveal" to confirm.              │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L5: SELECTIVE DISCLOSURE                                        │   ║
║  │  BBS+ proofs for consented PII fields · Post-match only          │   ║
║  │  Over MLS encrypted channel                                      │   ║
║  │  Tech: BBS+ (W3C bbs-2023), MLS                                 │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │  L6: BUCKET & VENUE ISOLATION                                    │   ║
║  │  Per-bucket keys · Per-venue policies · Audit roots              │   ║
║  │  Venues = access layer, Buckets = matching layer (many-to-many)  │   ║
║  │  Tech: HKDF key hierarchy, Pedersen commitments                  │   ║
║  └──────────────────────────────────────────────────────────────────┘   ║
╚═════════════════════════════════════════════════════════════════════════╝
```

## Implementation Phases

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         4-PHASE BUILD PLAN                              ║
║                                                                         ║
║  PHASE 1: AGENTVERSE CLI (Weeks 1-6)                    ← WE ARE HERE  ║
║  ┌────────────────────────────────────────────────────────────────────┐ ║
║  │  TypeScript · Commander.js · BBS+ VCs · A2A push-share            │ ║
║  │  Profile extraction (Claude Code + ChatGPT)                       │ ║
║  │  Tiered distillation · Credential wallet · Consent manager        │ ║
║  │  Mock agent for demo · did:jwk identity                           │ ║
║  └────────────────────────────────────────────────────────────────────┘ ║
║         │                                                               ║
║         ▼                                                               ║
║  PHASE 2: DELEGATES + ENCRYPTED TRANSPORT (Weeks 7-14)                 ║
║  ┌────────────────────────────────────────────────────────────────────┐ ║
║  │  Filesystem-delegate model for 1:1 direct contact                 │ ║
║  │  Three-tier filesystem (structured / evaluable_text / human_only) │ ║
║  │  evaluable_text defense stack (Spotlighting, PromptArmor)         │ ║
║  │  PQXDH + MLS encrypted sessions                                  │ ║
║  │  Sign-then-encrypt (DIDComm v2 authcrypt)                         │ ║
║  │  did:jwk → did:webvh migration · Tessera log                     │ ║
║  │  Doorbell Agent Card + deterministic triage                       │ ║
║  │  Referral tokens (BBS+ VP)                                        │ ║
║  │  Relationship records · Commit-then-reveal fairness               │ ║
║  └────────────────────────────────────────────────────────────────────┘ ║
║         │                                                               ║
║         ▼                                                               ║
║  PHASE 3: DISCOVERY + TEE MATCHING (Weeks 15-22)                      ║
║  ┌────────────────────────────────────────────────────────────────────┐ ║
║  │  Buckets (purpose namespaces) with cross-venue matching           │ ║
║  │  TEE clean rooms (Nitro Enclaves) for 1:N scoring                 │ ║
║  │  HNSW vector search + PSI eligibility gates inside TEE            │ ║
║  │  Anonymous introduction (venue-mediated PQXDH)                    │ ║
║  │  Post-match protocol (human_readable reveal → identity → direct)  │ ║
║  │  Venue SDK (Rust + TypeScript bindings)                           │ ║
║  │  WeKruit first-party venue                                        │ ║
║  └────────────────────────────────────────────────────────────────────┘ ║
║         │                                                               ║
║         ▼                                                               ║
║  PHASE 4: ECOSYSTEM (Weeks 23-30)                                      ║
║  ┌────────────────────────────────────────────────────────────────────┐ ║
║  │  Reputation engine (9-component formula + PageRank)                │ ║
║  │  Match tokens (Pedersen commitments, Tessera-anchored)            │ ║
║  │  Venue stakes + slashing conditions                               │ ║
║  │  ZK range predicates (Noir circuits)                              │ ║
║  │  Multi-cloud TEE (SEV-SNP, TDX alongside Nitro)                  │ ║
║  │  Agent SDK (Rust + TypeScript + Python)                           │ ║
║  └────────────────────────────────────────────────────────────────────┘ ║
╚═════════════════════════════════════════════════════════════════════════╝
```

## Security Model Summary

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        SECURITY MODEL                                   ║
║                                                                         ║
║  PRINCIPLE: Agents should never have data they don't need.              ║
║                                                                         ║
║  ┌────────────────────────────────────────────────────────────────────┐ ║
║  │                    DEFENSE-IN-DEPTH LAYERS                         │ ║
║  │                                                                    │ ║
║  │  1. DISTILLATION         PII split from exchange info at source    │ ║
║  │                          PII never enters commons                  │ ║
║  │                                                                    │ ║
║  │  2. COARSENING           4-tier progressive revelation             │ ║
║  │                          k-anonymity targets per tier              │ ║
║  │                          Raw values replaced with bands/categories │ ║
║  │                                                                    │ ║
║  │  3. CONTEXT MINIMIZATION Delegates have ONLY preset data           │ ║
║  │                          Filesystem is purpose-scoped projection   │ ║
║  │                          Ephemeral — destroyed after interaction   │ ║
║  │                                                                    │ ║
║  │  4. STRUCTURED DATA      Enum-only `structured` tier               │ ║
║  │                          additionalProperties: false               │ ║
║  │                          No free text in scoring path (Tier 1)    │ ║
║  │                                                                    │ ║
║  │  5. SPOTLIGHTING         evaluable_text base64-encoded             │ ║
║  │                          before LLM evaluation                     │ ║
║  │                          ~0% injection success                     │ ║
║  │                                                                    │ ║
║  │  6. CAPABILITY-LESS      Delegates have NO tools, NO network,      │ ║
║  │     DELEGATES            NO wallet access. Pure scoring function.  │ ║
║  │                          Even total compromise → wrong score only  │ ║
║  │                                                                    │ ║
║  │  7. HUMAN IN THE LOOP    Human sees scores + evidence + raw text   │ ║
║  │                          Human makes all connect/reveal decisions  │ ║
║  │                          Type "reveal" for PII (not just y/n)     │ ║
║  │                                                                    │ ║
║  │  8. COMMIT-THEN-REVEAL   Hash commitment to transparency log       │ ║
║  │                          Prevents bait-and-switch filesystems      │ ║
║  │                                                                    │ ║
║  │  9. TEE ISOLATION        1:N matching inside hardware enclaves     │ ║
║  │                          Attested code, KMS-bound key release     │ ║
║  │                          Raw data never exits enclave              │ ║
║  │                                                                    │ ║
║  │  10. BUCKET ISOLATION    Per-bucket HKDF keys                      │ ║
║  │                          Cross-bucket agents unlinkable            │ ║
║  │                          Per-venue policies and audit roots        │ ║
║  └────────────────────────────────────────────────────────────────────┘ ║
╚═════════════════════════════════════════════════════════════════════════╝
```
