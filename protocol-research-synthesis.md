# Encrypted Agent Commons Protocol — Research Synthesis

**Date:** 2026-03-15
**Sources:** backend-report-001, frontend-report-001, infra-report-001
**Status:** Complete — all three research teams reported

---

## Executive Summary

Three teams conducted deep parallel research (18 parallel agents, 800K+ tokens of research) across protocol cryptography, product/discovery, and security/infrastructure. This synthesis identifies the concrete decisions, gaps, conflicts, and next steps for building the EACP.

**The bottom line:** The protocol is buildable with today's technology, but with two critical pivots from the original design:

1. **MLS replaces Signal's Double Ratchet + Sesame** — OpenMLS (Apache-2.0) solves multi-device natively, is PQ-ready, formally verified, and avoids the AGPL licensing blocker of libsignal
2. **TEE-based vector search replaces cryptographic private search** — no open production-ready encrypted vector search exists; standard HNSW inside AWS Nitro Enclaves is the only viable MVP path

---

## 1. Confirmed Architecture Decisions

These design choices from the prior conversations are validated by all three teams' research:

| Decision | Validation | Confidence |
|----------|-----------|------------|
| **PQXDH for initial key exchange** | Public domain spec, implementable from permissive components (ml-kem + x25519-dalek + ed25519-dalek). No standalone crate exists — must build from spec. | HIGH |
| **ML-KEM-768 + ML-DSA-65 defaults** | aws-lc-rs v1.16.1 has stable ML-KEM-768 API. ML-DSA-65 available but unstable/non-FIPS. Correct security level for our threat model. | HIGH |
| **Transparency logs over blockchain** | Trillian Tessera (v1.0.2 GA) with witness cosigning. Same auditability, no consensus overhead. Tessera is the clear winner. | HIGH |
| **Capability-based authorization** | OWASP mapping confirms it's the strongest cross-cutting defense across all 10 LLM risks. | HIGH |
| **AWS Nitro Enclaves for TEE** | Zero published attacks, simplest KMS integration, Evervault proves 3+ years of production with identical architecture. | HIGH |
| **PSI for hard-constraint matching** | DH-based PSI on `voprf` crate gives sub-50ms for 200 attributes with ~6 KB communication. Sweet spot for our use case. | HIGH |
| **Injection firewall as protocol component** | Five-layer architecture designed: schema enforcement → content classification → quarantine (type-restricted outputs) → policy enforcement → audit. Based on FIDES, CaMeL, dual-firewall research. | HIGH |
| **Agent Cards for discovery** | A2A provides best base schema. Extend with attestations, reputation, liveness for our three-phase search. 30+ fields mapped to pre-filter → ANN → re-rank. | HIGH |
| **MCP for context brokering** | 300+ servers exist but zero handle encryption. Greenfield. `experimental.privacy` capability namespace fits perfectly. | HIGH |

---

## 2. Critical Pivots Required

### 2.1 MLS Replaces Signal Double Ratchet + Sesame

**Original design:** Use Signal's PQXDH + Double Ratchet + Sesame (multi-device) exactly as specified.

**Problem discovered:**
- libsignal is **AGPL-3.0** — viral copyleft that would force all venue operators to open-source their entire services
- Signal Foundation has historically not granted commercial license exceptions
- Sesame has **zero open-source implementations** in any language
- All standalone Double Ratchet crates are unmaintained and unaudited
- libsignal requires Rust nightly and is explicitly "unsupported outside Signal"

**Pivot:** Use **OpenMLS v0.7.2** (Apache-2.0/MIT) for session encryption and multi-device:

| Property | Signal + Sesame | MLS (OpenMLS) |
|----------|----------------|---------------|
| License | AGPL-3.0 (commercial blocker) | Apache-2.0/MIT |
| Multi-device | Separate layer (Sesame, unimplemented), fan-out O(n) | Native — devices are group members, O(log n) |
| PQ support | PQXDH + SPQR (AGPL) | X-Wing ciphersuite (ML-KEM + X25519) via formally verified libcrux |
| Standardization | De facto, Signal-specific | IETF RFC 9420 + RFC 9750 |
| Audited | Yes (internal) | Yes (independent) + formally verified ML-KEM |
| Forward secrecy | Per-message (Double Ratchet) | Per-epoch (commit-based) |

**Trade-off:** MLS forward secrecy is per-epoch, not per-message. For our use case (agent sessions, not high-frequency chat), this is acceptable. The licensing advantage is decisive.

**Implementation:** Custom PQXDH from spec (initial handshake) → OpenMLS (session management and encryption). PQXDH spec is public domain; components are all permissively licensed.

### 2.2 TEE-Based Vector Search for MVP (Not Cryptographic)

**Original design:** Private vector search using PACMANN, Apple PNNS, or Compass.

**Problem discovered:**

| System | Best Latency | Production Ready? | Open Source? | Blocker |
|--------|-------------|-------------------|-------------|---------|
| Apple PNNS | 1,139 QPS (batch) | Yes (iOS 18) | Yes (Swift only) | Swift-only, server sees DB in plaintext, closed ecosystem |
| Compass | 0.94s (SIFT1M) | No | Limited | No maintained release, 500MB client memory |
| PACMANN | 1.6s LAN / 3.1s WAN | No | Yes (Go) | 2.9 GB client storage, 400 MB maintenance comms |
| FedVSE | Not published | No | No | Depends on deprecated Intel SGX |

**Bottom line:** No open system achieves sub-100ms encrypted vector search today.

**Pivot:** Standard HNSW inside AWS Nitro Enclaves. Data encrypted at rest, decrypted only inside attested enclave, standard millisecond-latency search, policy-checked outputs via vsock. The TEE is the trust boundary, not the search algorithm.

**Trade-off:** The TEE operator (AWS) could theoretically observe operations inside the enclave. For our MVP threat model, this is acceptable. AWS Nitro has zero published attacks and dedicated CPU cores eliminate co-residency side channels.

**Future path:** Evaluate Compass's ORAM approach for V2-V3 when scenarios require fully untrusted servers.

---

## 3. Gaps Identified

### 3.1 FIPS Certification Gap (Risk: MEDIUM-HIGH)

**Finding:** No Rust crate provides FIPS-validated post-quantum cryptography today.

- ML-KEM: FIPS 3.0 (which includes ML-KEM) has "Pending Resubmission" status, 14+ months delayed
- ML-DSA: Not included in ANY CMVP submission from any vendor
- aws-lc-rs ML-DSA: Only available with `unstable` feature, mutually exclusive with `fips` feature

**Impact:** If FIPS compliance is a hard requirement for enterprise customers, the PQ components cannot be FIPS-validated on any known timeline.

**Recommendation:** Use aws-lc-rs in non-FIPS mode for PQ primitives. The classical primitives (AES-256-GCM, Ed25519, X25519) are FIPS-validated via CMVP #4816. Document the FIPS scope explicitly. Monitor CMVP Modules In Process list for FIPS 3.0 certificate award.

### 3.2 No APSI (Authorized PSI) in Rust (Risk: MEDIUM)

**Finding:** Microsoft's APSI is C++ only with heavy SEAL dependency. FFI wrapping estimated at 4-8 weeks due to SEAL's template-heavy C++. No Rust implementation exists.

**Impact:** APSI would let a trusted judge authorize items before intersection — useful for anti-spam and policy compliance in our matching pipeline.

**Recommendation:** Start with standard DH-based PSI using the `voprf` crate (~500-1000 lines of Rust). Add authorization logic at the application layer rather than the cryptographic layer. Revisit APSI wrapping in V2 if needed.

### 3.3 Memory Extraction Determinism (Risk: MEDIUM)

**Finding:** Mem0's extraction pipeline is production-proven (186M API calls/quarter) but entirely LLM-dependent — non-deterministic by nature. For protocol-level attestation of extracted facts, you need reproducibility.

**Impact:** Two agents extracting context from the same conversation history could produce different structured profiles. Attestation of "this profile was correctly derived from this conversation" requires deterministic steps.

**Recommendation:** Hybrid approach — use LLM extraction (Mem0-style) for initial profile generation, then deterministic schema validation + fact-level hashing for attestation. The attestation proves "this fact was extracted by this version of the pipeline from this conversation hash," not "any pipeline would extract the same facts."

### 3.4 Misinformation / Hallucination Defense (Risk: MEDIUM-HIGH)

**Finding (infra team):** OWASP LLM09 (Misinformation) is the only risk that needs entirely new defenses. The protocol secures data integrity but not epistemic quality.

**Impact:** An agent could publish false capability claims or hallucinated profile facts. Venue matching would operate on incorrect data.

**Recommendation:** Add confidence scoring and source citations to typed message schemas. Cross-agent verification for high-stakes claims. Fact-checking agent roles for critical venues. This is a V2 feature — not a blocker for MVP.

### 3.5 BBS+ Library Selection (Risk: LOW-MEDIUM)

**Finding (frontend team):** BBS+ is needed for selective disclosure but library maturity is uncertain.

**Recommendation:** Use W3C VC Data Integrity BBS Cryptosuites v1.0 reference implementation. The IETF draft (draft-irtf-cfrg-bbs-signatures) is progressing. For MVP, standard field-level encryption with per-venue keys is sufficient; BBS+ is a V2 enhancement.

---

## 4. Conflicts Between Teams

### 4.1 TEE Platform (Resolved: Nitro for MVP)

- **Backend:** Recommended Nitro for vector search, noted vendor lock-in risk
- **Infra:** Extensive comparison, also recommended Nitro for MVP, designed multi-cloud abstraction layer for production
- **Resolution:** Both teams agree. Build attestation abstraction layer from day one for future multi-cloud. Nitro for MVP, SEV-SNP (Azure) and TDX (GCP) for production scale.

### 4.2 Transparency Log (Resolved: Tessera)

- **Backend:** Referenced Trillian/CT-style logs generally
- **Infra:** Deep comparison found Trillian v1 is maintenance mode; recommended Tessera (v1.0.2 GA) as the successor
- **Resolution:** Use Tessera. It's a Go library (not a service), supports POSIX/S3/DynamoDB backends, has built-in witness support, and is CDN-cacheable. Write personality in Go, Rust client for agents.

### 4.3 Session Protocol (Resolved: MLS, not Signal)

- **Backend:** Discovered the AGPL blocker and proposed MLS as alternative
- **Infra:** Assumed Signal PQXDH + Double Ratchet in their OWASP mapping
- **Resolution:** MLS (OpenMLS) for session management. Custom PQXDH from spec for initial key exchange (public domain spec, permissive components). Infra team's OWASP mapping and injection firewall design are protocol-agnostic — both apply equally to MLS sessions.

### 4.4 SGX Status (Consistent: Avoid)

- **Backend:** Noted FedVSE's dependency on deprecated SGX as a critical issue
- **Infra:** Extensive CVE history (20+ attacks), effectively deprecated on client, 256MB EPC limit
- **Resolution:** Unanimous. Do not use SGX. Nitro for production, TDX as secondary.

---

## 5. Recommended Protocol Stack (Final)

| Layer | Component | Library/Tool | License | Priority |
|-------|-----------|-------------|---------|----------|
| **PQ Key Agreement** | PQXDH from spec | `ml-kem` 0.2.3 + `x25519-dalek` v2 + `ed25519-dalek` v2 | Apache-2.0/MIT/BSD-3 | P0 |
| **PQ Signatures** | ML-DSA-65 (registry certs) | `aws-lc-rs` 1.16.1 (unstable, non-FIPS) | Apache-2.0/ISC/MIT | P0 |
| **PQ KEM** | ML-KEM-768 (handshake) | `aws-lc-rs` 1.16.1 (stable) | Apache-2.0/ISC/MIT | P0 |
| **Session Encryption** | MLS TreeKEM | `openmls` 0.7.2 | Apache-2.0/MIT | P0 |
| **Multi-device** | MLS native (devices = group members) | `openmls` 0.7.2 | Apache-2.0/MIT | P0 |
| **PSI (eligibility)** | DH-based PSI | `voprf` 0.6.0 (RFC 9497) | Apache-2.0/MIT | P1 |
| **Vector Search** | HNSW inside Nitro Enclave | Standard HNSW + NSM attestation | — | P1 |
| **TEE Platform** | AWS Nitro Enclaves (MVP) | — | — | P0 |
| **Transparency Log** | Tessera personality | Trillian Tessera v1.0.2 (Go) | Apache-2.0 | P1 |
| **Witness Network** | OmniWitness, 3-of-5 quorum | OmniWitness (Go) | Apache-2.0 | P2 |
| **Agent Discovery** | Agent Cards (A2A-extended) | Custom schema + registry | — | P0 |
| **Context Brokering** | MCP server with privacy extension | `@modelcontextprotocol/server` (TS) | MIT | P0 |
| **Injection Firewall** | 5-layer architecture | Custom (Rust + schema validation) | — | P0 |
| **Memory Extraction** | Mem0 pipeline (wrapped) | mem0 open-source | Apache-2.0 | P1 |
| **Selective Disclosure** | BBS+ / VCs | W3C reference impl | Various | P2 |
| **Memory Safety** | zeroize + secrecy + mlock | `zeroize`, `secrecy`, `secmem-alloc` | Apache-2.0/MIT | P0 |
| **Binary Transparency** | Sigstore + SBOM | `sigstore-rs` v1.0 | Apache-2.0 | P2 |
| **Authenticated Time** | NTS (RFC 8915) | NTS client (Rust) | — | P1 |

---

## 6. Competitive Position Confirmed

### The Gap No One Fills

| Layer | Who Fills It | What's Missing |
|-------|-------------|----------------|
| **Extraction** (raw history → structured facts) | Mem0 (production), Letta, Cognee | No encryption, no selective disclosure |
| **Identity** (who is this agent?) | A2A Agent Cards, Fetch.ai Almanac | No privacy-preserving discovery |
| **Context Portability** (move context between apps) | Plurality (early), Heirloom (vaporware) | No matching, no transaction layer |
| **Communication** (agent-to-agent messaging) | A2A Protocol, MCP | No encryption, no venue isolation |
| **Transaction** (encrypted match + disclose + receipt) | **Nobody** | **This is our protocol** |

**Our unique position:** The transaction layer — privacy-preserving agent-to-agent matchmaking where encrypted attributes are compared inside TEE clean rooms without exposing raw data.

### Key Competitive Numbers

- Mem0: 186M API calls/quarter, $24M raised, 41K stars, 100K+ developers — but no encryption
- Plurality: $100K funding, 3 people — right vision, extremely early
- Heirloom: Token launched, no shipped technology
- OpenClaw: 196K stars, 300K+ users — proved demand, proved security catastrophe
- A2A: Google-backed, mature Agent Card spec — but no privacy layer

---

## 7. Implementation Roadmap

### Phase 1: MVP — Secure Talent Pool (Weeks 1-8)

| Week | Deliverable | Team |
|------|------------|------|
| 1-2 | aws-lc-rs ML-KEM-768 + ML-DSA-65 validation, benchmark key gen/encap/signing | Backend |
| 1-2 | Agent Card schema (JSON Schema), A2A-compatible with EACP extensions | Frontend |
| 1-2 | Nitro Enclave hello-world with KMS key release and attestation verification | Infra |
| 2-4 | PQXDH implementation from spec with property-based tests against Signal test vectors | Backend |
| 2-4 | MCP context broker server (TypeScript) with encrypted context packs | Frontend |
| 2-4 | Injection firewall layers 1+3+5 (schema validation, quarantine, audit) | Infra |
| 3-6 | OpenMLS integration for session management, device-as-group-member model | Backend |
| 3-6 | Venue SDK interfaces 1-3 (registration, search, match) for WeKruit | Frontend |
| 3-6 | Tessera personality for transparency log (4 entry types) | Infra |
| 4-8 | DH-based PSI on `voprf` for eligibility matching (50-200 attributes) | Backend |
| 6-8 | HNSW inside Nitro Enclave for vector search with attestation | Infra |
| 6-8 | WeKruit integration: extract context → encrypted match → selective disclosure | All |

### Phase 2: Encrypted Search v1 (Months 3-4)

- Federated vector search with enclave policy enforcement
- PSI/APSI eligibility gates as standard pipeline stage
- Transparency log live with OmniWitness cosigning
- Full 5-layer injection firewall with probabilistic classifier
- BBS+ selective disclosure (V1)
- Multi-cloud TEE abstraction (Nitro + SEV-SNP)

### Phase 3: Privacy Tiers + AEO (Months 5-6)

- Agent Card AEO metadata with adversarial-resistant ranking
- Compass ORAM evaluation for untrusted-server scenarios
- VRF-indexed key transparency (IETF keytrans pattern)
- Cross-agent verification for factual claims
- Agent reputation scoring in transparency logs
- BBS+ full deployment with unlinkable proofs

---

## 8. Key Risks to Monitor

| Risk | Severity | Trigger | Mitigation |
|------|----------|---------|------------|
| AWS-LC FIPS 3.0 slippage | Medium-High | No ML-KEM CMVP cert by Q3 2026 | Document non-FIPS PQ usage; classical primitives are validated |
| OpenMLS PQ maturity | Medium | X-Wing ciphersuite audit gaps | Track Cryspen's audit roadmap; X-Wing uses formally verified ML-KEM |
| Nitro vendor lock-in | Medium | Customer requires non-AWS deployment | TEE abstraction layer from day one; Anjuna Seaglass as commercial bridge |
| Private vector search gap | Low (accepted) | Customer requires zero-trust search | TEE is pragmatic; Compass port to Rust for V3 |
| BBS+ library stability | Medium | Breaking changes in IETF draft | Delay BBS+ to V2; use field-level encryption for MVP |
| Memory extraction non-determinism | Medium | Attestation requirements emerge | Hybrid extraction (LLM + deterministic validation) |

---

## Appendix: Source Reports

- **Backend Report:** `~/ai-dept/reports/backend-report-001.md` — 478 lines covering private vector search, aws-lc-rs PQ APIs, PSI/APSI crates, Signal/MLS libraries, security assessment
- **Frontend Report:** `~/ai-dept/reports/frontend-report-001.md` — 699 lines covering Agent Card schema, MCP ecosystem, Mem0/Plurality/Heirloom deep dive, Venue SDK design
- **Infra Report:** `~/ai-dept/reports/infra-report-001.md` — 557 lines covering TEE comparison, transparency logs, OWASP LLM Top 10 mapping, injection firewall architecture
- **Supporting Research:** `~/ai-dept/shared/research/` directory contains detailed sub-reports from individual research agents
