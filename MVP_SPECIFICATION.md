# Agentverse MVP Specification

## Phase 1 — Weeks 1–6

*Date: March 15, 2026 | Status: Defined*

---

## 1. Problem Statement

Users have spent hundreds of hours in LLM conversations that implicitly contain a rich personal profile (skills, interests, values, career context). This profile is trapped, not portable, not privacy-preserving, and not verifiable. Agentverse extracts this profile and enables privacy-preserving sharing with third-party agents via Google's A2A protocol.

**Core design philosophy**: Push encrypted context out to apps. Never pull agents into your data.

---

## 2. MVP Scope Summary

### In Scope (Phase 1)

| Component | What It Does | Has Profile Access? |
|-----------|-------------|:---:|
| **CLI (`agentverse`)** | User interface for extraction, review, sharing, and consent | No |
| **Sharing Pipeline** | Per-interaction: loads only approved credentials, generates VP, sends via A2A | Only approved attributes |
| **Profile Extractor** | Parses Claude Code JSONL + ChatGPT JSON exports → structured profile | Yes (offline) |
| **Credential Wallet** | Issues BBS+ signed W3C Verifiable Credentials over profile attributes | Encrypted at rest |
| **A2A Client** | Agent Card discovery, JWS verification, SendMessage (JSON-RPC 2.0) | Only the VP payload |
| **Consent Manager v1** | JSON config, interactive CLI consent, append-only audit log | No (attribute names only) |

### Explicitly Deferred (Phase 2+)

| Feature | Phase | Rationale |
|---------|-------|-----------|
| E2E encryption (sign-then-encrypt) | 2 | Bare age has no sender auth (Critical gap). Ship sign-then-encrypt properly via DIDComm v2 authcrypt. TLS sufficient for MVP. |
| ZKP predicate proofs (Noir) | 2 | BBS+ selective disclosure covers MVP needs |
| FIDES taint labels / SEAgent MAC | 2 | In-process data scoping is primary defense in MVP |
| OAuth 2.1 agent flows | 2 | MVP uses simpler scoped tokens |
| Process-level isolation (--experimental-permission) | 2 | In-process data scoping sufficient for push-only MVP; process isolation needed when processing untrusted inbound |
| Progressive trust tiers | 2 | MVP: binary verified/unverified |
| Key rotation protocol | 2 | MVP: single key pair, manual re-keying |
| Revocation registry | 2 | MVP: short-lived credentials (90-day TTL) |
| mTLS between agents | 2 | HTTPS + JWS verification sufficient for MVP |
| Canary tokens | 2 | Not critical for push-only architecture |
| gVisor sandboxing | 3 | Only needed when processing complex agent responses |
| MPC/FHE computation | 3 | Requires Phase 2 infrastructure |
| On-chain reputation (ERC-8004) | 3 | Requires ecosystem maturity |
| Agent SDK for third parties | 3 | Requires stable protocol |
| Key rotation protocol | 2 | MVP: single key pair, manual re-keying |
| Revocation registry | 2 | MVP: short-lived credentials (90-day TTL) |

---

## 3. CLI Commands

```
agentverse init                    # Generate BLS12-381 key pair, create ~/.agentverse/
agentverse extract                 # Extract profile from LLM history (auto-detect sources)
agentverse extract --source <path> # Extract from specific file/directory
agentverse extract --dry-run       # Show what would be extracted (sources, count, cost)
agentverse extract --full          # Force full re-extraction (not incremental)
agentverse extract --since <date>  # Only conversations after date
agentverse extract --confirm-remote # Acknowledge remote API usage for extraction
agentverse profile                 # Show current profile summary
agentverse profile --review        # Interactive review: confirm/edit/delete attributes
agentverse profile --export        # Export profile as JSON
agentverse credentials             # List issued VCs
agentverse credentials issue       # Issue VCs from reviewed profile
agentverse share --with <domain>   # Share selective VP with agent at domain
agentverse share --with <domain> --purpose <purpose> # Purpose-bound sharing
agentverse share --with <domain> --attributes <a,b,c> # Explicit attribute selection
agentverse agents                  # List known agents and their trust status
agentverse agents inspect <domain> # Fetch and display Agent Card details
agentverse audit                   # Show sharing audit log
agentverse audit --agent <domain>  # Filter audit log by agent
```

---

## 4. Profile Extractor

### 4.1 Supported Input Formats

**Claude Code (P0)**:
- Location: `~/.claude/projects/<hash>/sessions/*.jsonl`, `~/.claude/history.jsonl`
- Format: JSONL — one JSON object per line with `uuid`, `parentUuid` (DAG structure), `type`, `message`, `timestamp`, `sessionId`, `cwd`, `gitBranch`
- Streaming read (line-by-line, never load full file)
- Reconstruct threads via `parentUuid` chains
- Extract user messages only; use assistant messages for context
- Use `cwd` and `gitBranch` as weak skill signals

**ChatGPT Export (P0)**:
- Location: User-provided path to `conversations.json` from data export ZIP
- Format: JSON array of conversations with `mapping` DAG (UUID-keyed nodes, `parent`/`children` links)
- Streaming JSON parser for files > 500 MB
- Walk DAG from root nodes, sort by `create_time`
- Handle forks (message edits create branches — include all)

**Other tools (P1, post-MVP)**: Gemini (Takeout), Copilot Chat, Cursor — behind a pluggable `ConversationParser` interface.

### 4.2 Profile Schema

Six attribute categories, each becoming a separate VC:

| Category | Key Attributes | Sensitivity |
|----------|---------------|-------------|
| **Skills** | programmingLanguages, frameworks, tools, domains, softSkills | Low |
| **Interests** | interests, learningInterests | Low |
| **Communication** | verbosity, formality, technicalDepth, language | Low |
| **Values** | workValues, decisionFactors, preferredApproaches | Low |
| **Career** | currentRole, industry, teamContext, careerStage | Medium |
| **Demographics** | locationGeneral (city-level max), ageRange, spokenLanguages | High (opt-in) |

Every attribute carries metadata: `confidence` (0.0–1.0), `sources` (sessionId + messageUuid), `firstSeen`/`lastSeen`, `extractionMethod` (explicit/inferred/behavioral), `userVerified`, `sensitivity`.

### 4.3 Extraction Pipeline

```
Parse & Normalize → Chunk & Sample → LLM Extraction → Aggregate & Dedupe → User Review
```

1. **Parse**: All parsers produce `NormalizedConversation` format
2. **Chunk**: ~8K token chunks; for >1000 conversations, stratified sampling (100% last 30d, 50% 30–180d, 20% 180d+)
3. **Extract**: LLM with structured output; user's own API key or local (Ollama); per-attribute confidence + evidence citation
4. **Aggregate**: Merge duplicates (highest confidence, most specific value, latest timestamp); detect and flag conflicts
5. **Review**: Mandatory for `sensitivity: "high"` attributes; user can confirm/edit/delete/flag

**Privacy**: Pre-processing redaction filter strips API keys, passwords, PII before LLM extraction. Profile never contains raw conversation text. Remote API usage requires explicit confirmation.

**Performance targets**: Full extraction of 1000 conversations < 10 min (excluding LLM latency). Incremental update of 50 conversations < 30s. Memory cap: 512 MB.

### 4.4 Confidence Scoring

| Range | Label | Criteria |
|-------|-------|----------|
| 0.90–1.00 | Very High | Explicit, unambiguous user statement |
| 0.75–0.89 | High | Strong implicit evidence across multiple conversations |
| 0.50–0.74 | Medium | Moderate evidence, mentioned a few times |
| 0.25–0.49 | Low | Weak evidence, single mention, old data |
| < 0.25 | Excluded | Not included in profile (user can opt in during review) |

Time-decay: -0.05 per 90 days since lastSeen (rates vary by category: role/location decay at 90d, skills at 180d, interests at 365d, languages never).

---

## 5. Credential Wallet

### 5.1 Key Management

- **Algorithm**: BLS12-381 (required for BBS+ signatures)
- **Storage**: `~/.agentverse/keys/` with `0600` file permissions
- **Encryption at rest**: AES-256-GCM with key derived via Argon2id from user passphrase
- **Backup**: `agentverse init --export-key` outputs encrypted key backup
- **MVP**: Single key pair. Key rotation deferred to Phase 2.

### 5.2 Credential Format

- **Format**: JSON-LD only (not JWT — incompatible with BBS+ selective disclosure)
- **Cryptosuite**: `bbs-2023` (W3C Data Integrity BBS Cryptosuites v1.0)
- **Issuer = Subject**: Self-issued credentials (user's agent attests to their own attributes). Clearly labeled as self-attested.
- **Granularity**: One VC per attribute category (Skills, Interests, Communication, Values, Career, Demographics). Within each VC, individual attributes are separate claims enabling per-claim selective disclosure.
- **TTL**: 90-day default expiration. Re-issue on change (not mutate).
- **Issuance gate**: Only attributes with `confidence >= 0.50` or `userVerified: true`. All conflicts must be resolved.

### 5.3 Recommended Library Stack

| Library | Purpose | Notes |
|---------|---------|-------|
| `@digitalbazaar/bbs-2023-cryptosuite` v2.0+ | BBS+ signing & proof generation | Most aligned with W3C spec |
| `@digitalbazaar/bbs-signatures` v3.0+ | Core BBS+ operations | Pure JS implementation |
| `@digitalbazaar/bls12-381-multikey` | BLS12-381 key management | Multikey format |
| `@digitalbazaar/vc` | VC issuance & verification | W3C VC Data Model 2.0 |
| `@digitalbazaar/data-integrity` | Data Integrity proof framework | Proof envelope |

**Fallback**: If Digital Bazaar pure-JS is too slow (target: <10ms sign, <50ms proof gen, <50ms verify), swap to MATTR WASM-backed `@mattrglobal/bbs-signatures` v2.0+.

### 5.4 Verifiable Presentation Generation

- Unsigned VP envelope (no outer proof) to preserve unlinkability
- Mandatory disclosure: `@context`, `type`, `issuer`, `issuanceDate`, `credentialSubject.id`
- Nonce/challenge via `presentationHeader` (5-minute TTL) for replay prevention
- Multiple derived VCs in a single VP supported
- Array padding to fixed length to prevent fingerprinting by array size

---

## 6. A2A Client

### 6.1 Agent Discovery

- Fetch Agent Card from `https://<domain>/.well-known/agent.json` (A2A v1.0 path)
- **Mandatory JWS verification**: Unsigned or invalid-signature cards are rejected with clear error
- Schema validation via Zod (required fields: `name`, `interfaces`, `capabilities`, `securitySchemes`, `security`)
- Cache with 1-hour TTL, 24-hour max; conditional requests via ETag
- `did:web` resolution for DID verification: `did:web:<domain>` → `https://<domain>/.well-known/did.json`
- SSRF prevention: reject private/loopback endpoint URLs

**Technology**: `jose` v6.x (JWS operations, ES256 + EdDSA), `did-resolver` + `web-did-resolver` (DID resolution), built-in `fetch` (HTTP).

### 6.2 Message Exchange

- **Protocol**: JSON-RPC 2.0 over HTTPS (A2A v1.0 primary binding)
- **Outbound**: Only `DataPart` (structured JSON) — never `TextPart`
- **VP delivery**: As Artifact with `application/ld+json` MIME type
- **Task lifecycle**: Create → poll with exponential backoff → handle terminal states
- **Retry**: 3 attempts, exponential backoff (1s, 2s, 4s) with jitter, respect `Retry-After`
- **Timeouts**: 30s connection, 60s response, 300s total task completion

### 6.3 Inbound Message Security (MVP)

Since MVP is push-only (user's agent sends VPs outbound, doesn't process complex inbound instructions):
- Accept only structured `DataPart` responses (task status, acknowledgments)
- Reject any `TextPart` content from external agents — never parse as instructions
- Log all inbound messages to audit trail
- Full CaMeL dual-LLM defense deferred to Phase 2 (when bidirectional agent communication is added)

---

## 7. Consent Manager v1

### 7.1 Policy Files

Location: `~/.agentverse/policies/`

```yaml
# ~/.agentverse/policies/_default.yaml
# Default: deny everything
default: deny

# ~/.agentverse/policies/ditto-ai.yaml
agent: "ditto.ai"
purpose: "dating-profile"
allow:
  attributes: [interests, age_range, location_city]
constraints:
  duration: 30d
  max_requests: 100
  third_party_sharing: false
```

### 7.2 Interactive Consent

When no pre-authorized policy matches, display:

```
┌─────────────────────────────────────────────────┐
│  Agent: Ditto AI (ditto.ai)                     │
│  DID: did:web:ditto.ai:agent                    │
│  Purpose: dating-profile                        │
│  Trust: IDENTIFIED (Level 1)                    │
│                                                 │
│  Requesting attributes:                         │
│    - interests                                  │
│    - age_range                                  │
│    - location_city                              │
│                                                 │
│  [y] Allow once                                 │
│  [a] Always allow (saves policy)                │
│  [n] Deny                                       │
│  [d] Deny always                                │
│  [?] Show more details                          │
└─────────────────────────────────────────────────┘
```

### 7.3 Audit Log

- Format: Append-only JSONL at `~/.agentverse/audit/sharing.log`
- Every sharing event logged: timestamp, agent DID, attributes shared, purpose, VP hash, consent type (interactive/pre-authorized), expiry
- `0600` file permissions
- `agentverse audit` command to query and display

---

## 8. Security Baseline

### 8.1 Two-Pillar Defense Model

*Note: age E2E encryption was evaluated and deferred to Phase 2 after adversarial review found it provides confidentiality but NO sender authentication (Critical gap). Bare age encryption creates a false sense of security. Phase 2 will implement sign-then-encrypt (DIDComm v2 authcrypt pattern) properly.*

| Pillar | Principle | MVP Implementation |
|--------|-----------|-------------------|
| **Data Minimization** | Sharing pipeline never has data it doesn't need | `share` command loads only approved credential files; never loads full profile. Enforced by code architecture (no import path to full profile from sharing module). |
| **Structured Data Only** | Can't inject instructions into data | All A2A messages use `DataPart` (JSON schema validated); `TextPart` rejected |

**Transport security**: HTTPS/TLS 1.2+ for all communication (industry standard, sufficient for MVP threat model).

### 8.2 MVP Security Requirements

| Requirement | Implementation |
|-------------|---------------|
| **Data-minimized sharing pipeline** | `share` command loads only approved credential files via `readCredentials(approvedList)`. No call to `readProfile()`. No separate OS process needed — enforced by module architecture. |
| **BBS+ selective disclosure** | VP reveals only approved claims, not entire credential categories. Cryptographic exclusion, not just omission. |
| **HTTPS only** | Reject HTTP endpoints. TLS 1.2+. No escape hatch. |
| **Agent Card JWS verification** | Reject unsigned cards. Verify against DID Document public key. |
| **Structured data only** | All outbound A2A messages use `DataPart`. Never send `TextPart`. |
| **Inbound filtering** | Accept only `DataPart` from external agents. Reject and log `TextPart`. |
| **Audit logging** | All sharing events, Agent Card fetches, consent decisions logged (no profile data in logs). |
| **No markdown rendering** | Never render HTML/markdown from external agents. Plain text display only. |
| **File permissions** | All local files `0600` (keys, profile, policies, audit log). |
| **Profile encrypted at rest** | `profile.json` encrypted with wallet passphrase, not stored as plaintext. |
| **No raw content in profile** | Profile contains structured attributes only, never conversation text. |
| **SSRF prevention** | Reject Agent Card endpoints pointing to private/loopback IPs. |
| **Self-attested labeling** | Self-issued credentials always labeled "self-attested", never "verified". |
| **Mandatory user review** | Extracted attributes must be reviewed before VC issuance. Non-negotiable. |

### 8.3 What MVP Does NOT Defend Against (Documented Limitations)

| Risk | Why Deferred | Mitigation in MVP |
|------|-------------|-------------------|
| CDN/proxy eavesdropping | E2E encryption deferred (needs sign-then-encrypt, not bare age) | TLS transport encryption; selective disclosure limits exposure |
| Compromised agent with valid credentials | Needs progressive trust + reputation (Phase 2) | Data minimization limits blast radius to approved attributes only |
| Sophisticated prompt injection | Taint tracking needed for bidirectional comms (Phase 2) | MVP is push-only; sharing pipeline has no LLM, no untrusted input processing |
| Linkability of presentations | Full unlinkability needs advanced BBS+ features (Phase 2) | BBS+ provides basic unlinkability; documented limitation |
| Local malware reading ~/.agentverse/ | Needs OS-level sandboxing (Phase 3) | File permissions (0600), profile encrypted at rest, wallet encrypted |
| Supply chain attack on npm deps | Ongoing risk | Pin exact versions, run `npm audit`, vendor critical crypto libs |

---

## 9. Data Flow — End to End

```
┌─────────────────────────────────────────────────────────────────────┐
│  agentverse extract                                                  │
│                                                                     │
│  1. Auto-detect: ~/.claude/projects/**/sessions/*.jsonl              │
│  2. Parse JSONL (streaming, line-by-line)                           │
│  3. Normalize to NormalizedConversation format                      │
│  4. Chunk into ~8K token blocks                                     │
│  5. LLM extraction (user's API key) → structured attributes        │
│  6. Aggregate, deduplicate, detect conflicts                        │
│  7. User review (mandatory for high-sensitivity)                    │
│  8. Save to ~/.agentverse/profile.json                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  agentverse credentials issue                                        │
│                                                                     │
│  1. Load profile (check: all conflicts resolved, confidence >= 0.5) │
│  2. Generate BLS12-381 key pair (if not exists)                     │
│  3. Issue BBS+ signed VC per attribute category                     │
│  4. Store VCs in ~/.agentverse/credentials/                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  agentverse share --with ditto.ai --purpose dating-profile           │
│                                                                     │
│  1. Fetch Agent Card from https://ditto.ai/.well-known/agent.json   │
│  2. Verify JWS signature → resolve did:web:ditto.ai:agent           │
│  3. Check consent: policy file or interactive prompt                │
│  4. Generate VP: BBS+ selective disclosure of allowed attributes    │
│  5. A2A SendMessage (JSON-RPC 2.0): VP as Artifact (DataPart)      │
│  6. Handle task response (COMPLETED / FAILED / INPUT_REQUIRED)      │
│  7. Log to audit trail                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | 22 LTS | TypeScript execution |
| **Language** | TypeScript | 5.x | Type safety |
| **CLI framework** | Commander.js | 13.x | Command parsing, help generation |
| **Schema validation** | Zod | 3.x | Profile schema, Agent Card validation, LLM output validation |
| **BBS+ signatures** | @digitalbazaar/bbs-2023-cryptosuite | 2.x | VC signing & proof generation |
| **VC library** | @digitalbazaar/vc | latest | VC issuance & verification |
| **Key management** | @digitalbazaar/bls12-381-multikey | latest | BLS12-381 key operations |
| **JWS operations** | jose | 6.x | Agent Card signature verification |
| **DID resolution** | did-resolver + web-did-resolver | latest | did:web method resolution |
| **HTTP** | Built-in fetch | — | A2A communication |
| **Streaming JSON** | stream-json | latest | Large ChatGPT export parsing |
| **Encryption at rest** | Node.js crypto (AES-256-GCM) | — | Key + profile storage encryption |
| **Key derivation** | argon2 (npm) | latest | Passphrase → encryption key |
| **Config files** | yaml (npm) | latest | Policy file parsing |

---

## 11. File System Layout

```
~/.agentverse/
├── keys/
│   ├── private.key.enc     # AES-256-GCM encrypted BLS12-381 private key
│   └── public.key          # BLS12-381 public key (also in DID Document)
├── profile.json             # Extracted profile (pre-VC structured data)
├── extraction-state.json    # Tracks last-processed timestamp per source
├── credentials/
│   ├── skills.vc.json       # BBS+ signed VC for skills
│   ├── interests.vc.json    # BBS+ signed VC for interests
│   ├── communication.vc.json
│   ├── values.vc.json
│   ├── career.vc.json
│   └── demographics.vc.json # Only if user opted in
├── policies/
│   ├── _default.yaml        # Default deny-all policy
│   └── <domain>.yaml        # Per-agent pre-authorized policies
├── agents/
│   └── <domain>.card.json   # Cached Agent Cards with TTL metadata
├── audit/
│   └── sharing.log          # Append-only JSONL audit trail
└── did/
    └── did.json             # User's DID Document (did:web:localhost)
```

All files created with `0600` permissions.

---

## 12. Acceptance Criteria

### Week 1 Gate: BBS+ Proof-of-Concept (Days 1-5)

Before any other code is written, prove the crypto works:
- [ ] Generate BLS12-381 key pair with Digital Bazaar library
- [ ] Sign a VC with `bbs-2023` cryptosuite using a custom JSON-LD context
- [ ] Produce a derived proof with selective disclosure (reveal 3 of 10 claims)
- [ ] Verify the derived proof with a second library or test vectors

**If this takes > 5 days**: Emergency reassessment. Consider per-attribute Ed25519 VCs as tactical retreat.

### Must-Have for MVP Launch

- [ ] `agentverse extract` successfully parses Claude Code JSONL and produces a structured profile
- [ ] `agentverse extract` successfully parses ChatGPT `conversations.json` export
- [ ] Mandatory user review of extracted attributes before VC issuance
- [ ] `agentverse credentials issue` produces valid BBS+ signed W3C VCs (verifiable by standard VC verifiers)
- [ ] **BBS+ selective disclosure**: VP contains only user-approved attributes; verifier cannot access hidden claims
- [ ] `agentverse share` fetches Agent Card from `/.well-known/agent.json`, verifies JWS, prompts for consent, sends VP via A2A
- [ ] **Data-minimized sharing**: `share` command loads only approved credential files, never loads full profile
- [ ] Unsigned Agent Cards are rejected with clear error message
- [ ] Self-issued credentials labeled "self-attested" everywhere (never "verified")
- [ ] `profile.json` encrypted at rest (not stored as plaintext)
- [ ] All sharing events logged to audit trail (no profile data in logs)
- [ ] No conversation text appears in profile, VCs, VPs, or audit log
- [ ] Pre-processing redaction filter runs before LLM extraction (API keys, passwords, PII patterns)
- [ ] HTTPS-only enforcement (HTTP endpoints rejected)
- [ ] Mock agent in repo for testing and demo
- [ ] ChatGPT parser: cycle detection, streaming for large files, depth limits

### Nice-to-Have for MVP

- [ ] Incremental extraction (only process new conversations since last run)
- [ ] `--dry-run` mode showing extraction plan and cost estimate
- [ ] Multiple VP in single sharing request (combining attributes from multiple VCs)
- [ ] ChatGPT streaming parser for files > 500 MB
- [ ] `agentverse agents` listing known agents with cached trust status

---

## 13. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BBS+ libraries immature / breaking changes | Medium | High | Pin versions; have MATTR WASM fallback; test suite against spec vectors |
| Claude Code JSONL format changes | Low | Medium | Version-detect via `version` field; pluggable parser architecture |
| A2A v1.0 spec changes before stabilization | Low | Medium | Isolate A2A client behind interface; track spec repo |
| LLM extraction accuracy too low | Medium | Medium | Mandatory user review; confidence thresholds; iterative prompt refinement |
| did:web requires HTTPS hosting for user's DID | Medium | Low | MVP: use localhost DID for development; document production hosting requirement |
| Performance: BBS+ proof generation too slow in pure JS | Medium | Medium | Benchmark early; MATTR WASM fallback ready |
| age encryption library maturity in JS/TS | Low | Medium | age spec is simple; sodium-native as fallback for X25519+ChaCha20 |
| Scoped instance isolation on user's machine | Medium | Medium | Process-level isolation in MVP; gVisor in Phase 3 |
| User doesn't have LLM API key for extraction | Low | Low | Support Ollama for local inference; document API key setup |

---

## Appendix: Detailed Requirements Documents

The following detailed requirements documents were produced during the Define phase:

1. **[PROFILE_EXTRACTOR_REQUIREMENTS.md](PROFILE_EXTRACTOR_REQUIREMENTS.md)** — 50+ requirements covering input formats, profile schema, extraction pipeline, edge cases, and output format
2. **[REQUIREMENTS_A2A_CLIENT_AND_SECURITY.md](REQUIREMENTS_A2A_CLIENT_AND_SECURITY.md)** — 130 requirements (R1–R6) covering agent discovery, message exchange, signing/verification, consent manager, security baseline, and edge cases
3. **[CREDENTIAL_WALLET_REQUIREMENTS.md](CREDENTIAL_WALLET_REQUIREMENTS.md)** — 190+ requirements covering credential wallet, BBS+ implementation, VP generation, profile-to-VC mapping, and MVP boundaries
