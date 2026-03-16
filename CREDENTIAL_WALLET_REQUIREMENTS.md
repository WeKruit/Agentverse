# Credential Wallet & Privacy Engine: Functional Requirements

**Component**: Credential Wallet, Privacy Engine (BBS+ Selective Disclosure)
**Scope**: Agentverse MVP (Phase 1)
**Date**: March 15, 2026
**Status**: Requirements Definition

---

## Table of Contents

1. [Standardization & Library Landscape](#1-standardization--library-landscape)
2. [Credential Wallet Requirements](#2-credential-wallet-requirements)
3. [BBS+ Signature Implementation Requirements](#3-bbs-signature-implementation-requirements)
4. [Verifiable Presentation Generation Requirements](#4-verifiable-presentation-generation-requirements)
5. [Profile-to-VC Mapping Requirements](#5-profile-to-vc-mapping-requirements)
6. [MVP Boundaries](#6-mvp-boundaries)

---

## 1. Standardization & Library Landscape

### 1.1 Current State of BBS+ Standardization

| Specification | Status | Version | Date | Notes |
|---|---|---|---|---|
| **IRTF BBS Signature Scheme** | Active Internet-Draft | draft-irtf-cfrg-bbs-signatures-10 | January 8, 2026 | Intended as Informational RFC via IRTF stream. Authors: Looker, Kalos, Whitehead, Lodder. Expires July 12, 2026. Not yet an RFC; no document shepherd or IESG assignment. |
| **W3C Data Integrity BBS Cryptosuites v1.0** | Candidate Recommendation | 1.0 CR | April 4, 2024 | Requires two independent implementations to advance. The core VC 2.0 family achieved W3C Recommendation status in 2025, but BBS cryptosuite has NOT yet been promoted to Recommendation. |
| **W3C Verifiable Credentials Data Model v2.0** | W3C Recommendation | 2.0 | May 2025 | Full standard. Seven specifications in the family achieved Recommendation status. |
| **W3C Verifiable Credential Data Integrity 1.0** | W3C Recommendation | 1.0 | 2025 | Full standard. Foundation for all Data Integrity cryptosuites. |
| **IRTF BBS Blind Signatures** | Active Internet-Draft | draft-02 | September 2025 | Companion spec for blind signing. Informational. |
| **IRTF BBS Per-Verifier Linkability** | Active Internet-Draft | draft-02 | September 2025 | Companion spec for domain-specific linkability. |

**Risk assessment**: BBS is mature enough for an MVP. The IRTF draft is at version 10 with active development. The W3C cryptosuite is at CR with multiple implementations. The core VC 2.0 data model is a full W3C Recommendation. The remaining risk is that algorithm details could change before the IRTF draft becomes an RFC, but the core BBS construction (Sign, Verify, ProofGen, ProofVerify) is stable.

### 1.2 TypeScript/Node.js Library Evaluation

#### Option A: Digital Bazaar Ecosystem (RECOMMENDED for MVP)

| Package | Version | Status | Role |
|---|---|---|---|
| `@digitalbazaar/bbs-2023-cryptosuite` | 2.0.1 | Active, published ~3 months ago | W3C bbs-2023 cryptosuite implementation for jsonld-signatures |
| `@digitalbazaar/bbs-signatures` | 3.0.0 | Active, published ~1 year ago | Low-level BBS Sign/Verify/ProofGen/ProofVerify |
| `@digitalbazaar/bls12-381-multikey` | latest | Active | BLS12-381 key pair generation and management |
| `@digitalbazaar/vc` | latest | Active | W3C VC issuance and verification (issue, createPresentation, verify) |
| `jsonld-signatures` | 11.2+ | Active | Data Integrity proof framework |

**Rationale**: Digital Bazaar is a primary author of the W3C VC specifications. Their packages form a coherent stack from low-level BBS operations through W3C-compliant VC issuance and selective disclosure. The `bbs-2023-cryptosuite` directly implements the W3C Candidate Recommendation. Node.js 18+ required.

#### Option B: MATTR Global Ecosystem

| Package | Version | Status | Role |
|---|---|---|---|
| `@mattrglobal/bbs-signatures` | 2.0.0 | Active but last published ~1 year ago | BBS+ signature primitives (WASM-based, Rust underneath) |
| `@mattrglobal/jsonld-signatures-bbs` | latest | Unclear maintenance | JSON-LD proof suite for BBS+ |
| `@mattrglobal/node-bbs-signatures` | N/A | **Archived** (Feb 26, 2025, read-only) | Legacy node-specific BBS+ implementation |
| `@mattrglobal/pairing-crypto` | latest | Active (Rust library with WASM bindings) | Low-level pairing-based crypto (BLS12-381) |

**Assessment**: The MATTR stack is performance-optimized (Rust/WASM) and was historically the most popular BBS+ JS library. However, `node-bbs-signatures` was archived in early 2025, and the ecosystem's alignment with the latest W3C bbs-2023 cryptosuite specification is less clear than Digital Bazaar's. Weekly downloads of `@mattrglobal/bbs-signatures` are approximately 5,600/week.

#### Option C: Dock Network Ecosystem

| Package | Version | Status | Role |
|---|---|---|---|
| `@docknetwork/crypto-wasm-ts` | latest | Active | TypeScript abstractions over Rust WASM crypto library |
| `@docknetwork/crypto-wasm` | latest | Active | WASM wrapper over Rust crypto library |

**Assessment**: Most feature-rich implementation, supporting BBS, BBS+, PS, and BBDT16 signature schemes, plus composite proof systems (proving knowledge of multiple signatures, accumulator membership). However, it is tightly coupled to the Dock ecosystem and has a heavier dependency footprint. Better suited for advanced Phase 2/3 use cases (composite proofs, accumulators for revocation).

#### Recommendation

**Use the Digital Bazaar ecosystem for MVP**:
- `@digitalbazaar/bbs-2023-cryptosuite` for the W3C-compliant cryptosuite
- `@digitalbazaar/bbs-signatures` for low-level BBS operations
- `@digitalbazaar/bls12-381-multikey` for key management
- `@digitalbazaar/vc` for VC issuance and VP creation
- `jsonld-signatures` (v11.2+) as the proof framework

**Fallback**: If performance benchmarking reveals the Digital Bazaar pure-JS implementation is too slow for the CLI experience, swap the low-level BBS layer to `@mattrglobal/bbs-signatures` (Rust/WASM) while keeping the Digital Bazaar higher-level VC/cryptosuite layer. Measure before optimizing.

---

## 2. Credential Wallet Requirements

### 2.1 Storage Format

**REQ-CW-001**: The Credential Wallet MUST store Verifiable Credentials in **JSON-LD format** conforming to the W3C Verifiable Credentials Data Model v2.0.

**REQ-CW-002**: The Credential Wallet MUST NOT use JWT-encoded VCs. Rationale: BBS+ selective disclosure via the bbs-2023 cryptosuite operates on JSON-LD documents with Data Integrity proofs. JWT-based VCs use a different securing mechanism (JOSE/COSE) that is incompatible with BBS+ selective disclosure as defined in the W3C specification.

**REQ-CW-003**: Each stored VC MUST include a Data Integrity proof with `cryptosuite: "bbs-2023"` and `type: "DataIntegrityProof"`.

**REQ-CW-004**: The wallet storage format MUST be a directory of JSON files on the local filesystem at `~/.agentverse/wallet/credentials/`, one file per credential, named by a deterministic hash of the credential ID.

**REQ-CW-005**: The wallet directory MUST be protected with filesystem permissions `0700` (owner read/write/execute only). The wallet MUST verify these permissions on startup and refuse to operate if the directory is world-readable or group-readable.

**REQ-CW-006**: The wallet MUST maintain an index file (`~/.agentverse/wallet/index.json`) mapping credential IDs to file paths, credential types, issuance dates, expiration dates, and attribute names contained in each credential. This index MUST be updated atomically on any credential change.

**REQ-CW-007**: Credential files at rest MUST be encrypted using AES-256-GCM, with the encryption key derived from a user-supplied passphrase via Argon2id (memory cost: 64 MB, iterations: 3, parallelism: 4). The salt MUST be unique per wallet and stored in `~/.agentverse/wallet/salt`. The nonce MUST be unique per file encryption operation.

**REQ-CW-008**: The wallet MUST support an "unlocked" session model: the user provides their passphrase once per CLI session, and the derived key is held in memory for the session duration. The key MUST be zeroed from memory when the session ends or after a configurable inactivity timeout (default: 15 minutes).

### 2.2 Key Management

**REQ-CW-010**: The wallet MUST generate and store a BLS12-381 key pair for BBS+ operations. This key pair serves as the user agent's issuer key (for self-issuing credentials) and holder key (for deriving proofs).

**REQ-CW-011**: Key generation MUST use the `@digitalbazaar/bls12-381-multikey` library, producing a key pair on the BLS12-381 curve (G2 public key for BBS+ signing compatibility).

**REQ-CW-012**: The private key MUST be stored encrypted at `~/.agentverse/wallet/keys/bls12-381-private.json`, encrypted with the same AES-256-GCM scheme as credentials (REQ-CW-007). The private key MUST NEVER be written to disk in plaintext.

**REQ-CW-013**: The public key MUST be stored in unencrypted Multikey format at `~/.agentverse/wallet/keys/bls12-381-public.json`, suitable for embedding in DID Documents and credential `verificationMethod` references.

**REQ-CW-014**: Key derivation from a master seed is DEFERRED from MVP. For MVP, a single BLS12-381 key pair is generated randomly using a CSPRNG. Hierarchical deterministic key derivation (e.g., BIP-32 style for BLS keys) is a Phase 2 requirement.

**REQ-CW-015**: Key backup MUST be supported via an explicit `agentverse wallet export` command that produces an encrypted backup file (AES-256-GCM, separate passphrase). The backup MUST include: the private key, all credentials, the wallet index, and all consent policies. The backup format MUST be versioned (format version 1 for MVP).

**REQ-CW-016**: Key import MUST be supported via `agentverse wallet import <backup-file>` which decrypts and restores the wallet from backup, requiring both the backup passphrase and the (possibly new) wallet passphrase.

**REQ-CW-017**: Key rotation is DEFERRED from MVP. When implemented (Phase 2), key rotation MUST re-issue all existing credentials with the new key and update the DID Document. Old credentials signed with the prior key MUST remain verifiable for a grace period (configurable, default 30 days).

**REQ-CW-018**: The wallet MUST associate the BLS12-381 public key with the user's `did:web` DID. The DID Document MUST contain a `verificationMethod` entry of type `Multikey` with the public key encoded in Multibase format.

### 2.3 Self-Issuing Credentials

**REQ-CW-020**: The user's agent MUST act as both Issuer and Subject (Holder) of profile credentials. This is the "self-attested credential" pattern defined in W3C VC 2.0.

**REQ-CW-021**: The `issuer` field in self-issued credentials MUST be the user's DID (e.g., `did:web:localhost:agentverse:user`). The `credentialSubject.id` field MUST be the same DID.

**REQ-CW-022**: Self-issued credentials MUST be understood by verifiers as self-attested claims. The system MUST NOT represent self-issued credentials as having third-party authority. The CLI MUST clearly label credentials as "self-attested from conversation history" in any user-facing output.

**REQ-CW-023**: The trust value of self-attested credentials comes from: (a) the consistency of the claims across multiple conversation extractions, (b) the cryptographic binding to the user's DID, and (c) the BBS+ signature enabling selective disclosure without re-signing. The system MUST NOT claim that self-issued credentials are "verified" by a third party.

**REQ-CW-024**: Future support for third-party-issued credentials (e.g., an employer issuing a credential attesting to skills, or a university issuing a degree credential) is DEFERRED from MVP but MUST be architecturally supported. The wallet MUST store both self-issued and third-party-issued credentials without distinction in storage format, differing only in the `issuer` field.

### 2.4 Credential Lifecycle

#### 2.4.1 Issuance

**REQ-CW-030**: Credential issuance MUST be triggered by the Profile Extractor after extracting structured claims from LLM conversation history. The issuance flow is: `raw history -> Profile Extractor -> structured claims -> Credential Wallet (issuance) -> stored VC`.

**REQ-CW-031**: During issuance, the wallet MUST:
1. Construct a JSON-LD credential document with `@context`, `type`, `issuer`, `issuanceDate`, `expirationDate`, and `credentialSubject`.
2. Define mandatory disclosure pointers (claims that MUST always be disclosed: `@context`, `type`, `issuer`, `issuanceDate`, `credentialSubject.id`).
3. Sign the credential using the bbs-2023 cryptosuite's base proof creation algorithm, producing a Data Integrity proof that embeds the BBS signature and mandatory pointer metadata.
4. Store the signed credential and update the wallet index.

**REQ-CW-032**: The `issuanceDate` MUST be set to the current UTC timestamp at issuance time.

**REQ-CW-033**: The `expirationDate` MUST be set to 90 days from issuance by default. This is configurable via `agentverse config set credential.ttl <duration>`. Rationale: profile attributes extracted from conversation history become stale; a 90-day default forces periodic refresh.

**REQ-CW-034**: Each credential MUST have a unique `id` field, formatted as a URN: `urn:uuid:<v4-uuid>`.

#### 2.4.2 Storage

**REQ-CW-035**: Credentials MUST be stored as defined in REQ-CW-004 through REQ-CW-008.

**REQ-CW-036**: The wallet MUST support listing all stored credentials via `agentverse wallet list`, showing: credential ID, type, number of claims, issuance date, expiration date, and whether expired.

**REQ-CW-037**: The wallet MUST support inspecting a specific credential via `agentverse wallet show <credential-id>`, displaying all claims in human-readable form.

#### 2.4.3 Presentation

**REQ-CW-038**: Presentation (selective disclosure) is handled by the Privacy Engine (Section 4). The wallet's role is to provide the stored credential with its base proof to the Privacy Engine on request.

**REQ-CW-039**: The wallet MUST refuse to provide credentials that have expired (current time > `expirationDate`) for presentation. Expired credentials MUST be flagged in `wallet list` and the user MUST be prompted to re-extract and re-issue.

#### 2.4.4 Revocation

**REQ-CW-040**: Formal revocation registries (Bitstring Status List, Revocation List 2020) are DEFERRED from MVP.

**REQ-CW-041**: For MVP, "revocation" is achieved by: (a) the user deleting a credential from the wallet via `agentverse wallet delete <credential-id>`, and (b) the credential expiring naturally after its TTL. Since the user is both issuer and holder, there is no external revocation use case in MVP.

**REQ-CW-042**: When a credential is deleted, the wallet MUST: remove the credential file, update the index, and log the deletion in the audit log. The wallet MUST NOT attempt to notify any verifier that previously received a presentation derived from this credential. Verifier notification on revocation is a Phase 2 requirement.

#### 2.4.5 Renewal / Re-issuance

**REQ-CW-043**: When profile attributes change (detected by re-running the Profile Extractor), the system MUST issue a NEW credential rather than mutating the existing one. Rationale: BBS+ signatures are over the entire set of messages at issuance time; changing a claim invalidates the signature. Re-issuance is the correct approach.

**REQ-CW-044**: On re-issuance, the wallet MUST:
1. Issue a new credential with the updated claims, new `id`, new `issuanceDate`, new `expirationDate`.
2. Mark the old credential as superseded (add `supersededBy: <new-credential-id>` to the index entry).
3. Retain the old credential for a configurable grace period (default: 7 days) to allow any in-flight presentations to remain verifiable against the old base proof. After the grace period, the old credential MAY be deleted.

**REQ-CW-045**: The CLI MUST provide `agentverse profile refresh` which re-runs the Profile Extractor on conversation history, diffs the new claims against existing credentials, and re-issues credentials for any claims that have changed. Claims that have not changed MUST NOT trigger re-issuance.

### 2.5 Credential Granularity: Multiple Credentials vs. One Big Credential

**REQ-CW-050**: The wallet MUST issue credentials at the **domain-level granularity** -- one credential per logical domain of the user's profile. The MVP defines the following credential types:

| Credential Type | Claims Included | Rationale |
|---|---|---|
| `AgentverseSkillsCredential` | Technical skills (name, years, proficiency level) | Skills are frequently shared together; recruiting use case |
| `AgentverseInterestsCredential` | Hobbies, interests, passions | Personal interests; dating/social use case |
| `AgentversePreferencesCredential` | Communication style, work preferences, tool preferences | Professional context sharing |
| `AgentverseBasicProfileCredential` | Location (city-level), age range, languages spoken | Basic demographics; general use case |

**REQ-CW-051**: The system MUST NOT issue a single monolithic credential containing all profile attributes. Rationale:
- **Selective disclosure granularity**: While BBS+ allows per-claim selective disclosure within a credential, presenting any claims from a credential reveals the credential's type and metadata (issuer, issuance date). Separating domains limits metadata leakage. A verifier receiving an `AgentverseSkillsCredential` does not learn that the user also has an `AgentverseInterestsCredential`.
- **Re-issuance efficiency**: When a single skill changes, only the skills credential needs re-issuance, not the entire profile.
- **Unlinkability**: Presentations from different credential types are cryptographically unlinkable. A recruiter receiving a skills VP and a dating app receiving an interests VP cannot correlate them as belonging to the same holder through BBS+ proof values.

**REQ-CW-052**: The system MUST NOT issue one credential per individual claim (e.g., one credential per skill). Rationale:
- Excessive key management overhead.
- Each credential requires its own base proof with mandatory disclosure fields (`@context`, `type`, `issuer`, etc.), creating unacceptable per-claim overhead.
- Presenting 10 skills would require 10 separate derived proofs rather than one.

**REQ-CW-053**: The credential type vocabulary MUST be extensible. New credential types can be added in later phases without breaking existing credentials or presentations. The wallet MUST accept and store credentials of unknown types (forward compatibility).

---

## 3. BBS+ Signature Implementation Requirements

### 3.1 Core Cryptographic Operations

**REQ-BBS-001**: The system MUST implement the six core BBS algorithms as defined in draft-irtf-cfrg-bbs-signatures-10:

| Algorithm | Purpose | When Used |
|---|---|---|
| **KeyGen** | Generate BLS12-381 key pair | Wallet initialization (`agentverse init`) |
| **SkToPk** | Derive public key from secret key | Key export, DID Document construction |
| **Sign** | Sign ordered list of messages, produce constant-size signature | Credential issuance |
| **Verify** | Verify signature against messages and public key | Self-verification after issuance (sanity check) |
| **ProofGen** | Generate ZK proof revealing only selected messages | Verifiable Presentation creation (selective disclosure) |
| **ProofVerify** | Verify ZK proof against disclosed messages and public key | Third-party verifier (verification endpoint) |

**REQ-BBS-002**: All BBS operations MUST use the BLS12-381 curve with the pairing-friendly construction defined in the IRTF draft.

**REQ-BBS-003**: The system MUST use the `@digitalbazaar/bbs-signatures` library for low-level BBS operations (Sign, Verify, ProofGen, ProofVerify) and `@digitalbazaar/bbs-2023-cryptosuite` for the W3C Data Integrity integration layer.

### 3.2 Key Generation

**REQ-BBS-010**: Key generation MUST use the `@digitalbazaar/bls12-381-multikey` library's `generateKeyPair()` function, which internally uses a CSPRNG for randomness.

**REQ-BBS-011**: The generated key pair MUST consist of:
- A secret key (scalar in the BLS12-381 field)
- A public key (point on the G2 curve of BLS12-381)

**REQ-BBS-012**: The public key MUST be serialized in Multikey format (Multibase + Multicodec prefix) for storage and DID Document embedding.

### 3.3 Signing (Credential Issuance)

**REQ-BBS-020**: Signing MUST be performed through the bbs-2023 cryptosuite's base proof creation algorithm, not by directly calling BBS Sign. The cryptosuite handles:
1. JSON-LD canonicalization (RDF Dataset Normalization)
2. HMAC-based blank node identifier shuffling (for unlinkability)
3. Separation of mandatory and non-mandatory statements via JSON pointers
4. BBS Sign over the canonicalized statements
5. Serialization of the proof with appropriate header bytes (`0xd9, 0x5d, 0x02` for baseline)

**REQ-BBS-021**: The issuer MUST specify mandatory disclosure JSON pointers at signing time. For MVP, the following JSON pointers are ALWAYS mandatory:
- `/issuer`
- `/issuanceDate`
- `/credentialSubject/id`
- `/@context` (all context entries)
- `/type` (all type entries)

**REQ-BBS-022**: All claims in `credentialSubject` (other than `id`) are non-mandatory (selectively disclosable) by default.

**REQ-BBS-023**: The system MUST use the `"baseline"` feature option for MVP. The `"anonymous_holder_binding"`, `"pseudonym"`, and `"holder_binding_pseudonym"` feature options are DEFERRED to Phase 2.

### 3.4 Proof Generation (Selective Disclosure)

**REQ-BBS-030**: Proof generation MUST be performed through the bbs-2023 cryptosuite's derived proof creation algorithm, which:
1. Parses the base proof from the stored credential
2. Reconstructs the HMAC function and separates mandatory from non-mandatory statements
3. Takes an array of JSON pointers (`selectivePointers`) indicating which non-mandatory claims to reveal
4. Executes BBS ProofGen to produce a zero-knowledge proof
5. Serializes the derived proof with header bytes (`0xd9, 0x5d, 0x03` for baseline)

**REQ-BBS-031**: The system MUST accept selective disclosure requests as an array of JSON pointer strings. Example: `["/credentialSubject/skills/0/name", "/credentialSubject/skills/0/yearsExperience"]` to disclose only the first skill's name and years of experience.

**REQ-BBS-032**: The derived proof MUST be a valid Data Integrity proof that a verifier can verify using only: the disclosed claims, the derived proof value, and the issuer's public key. The verifier MUST NOT need the original base proof or undisclosed claims.

**REQ-BBS-033**: Each derived proof MUST be cryptographically unlinkable to: (a) other derived proofs from the same base credential, and (b) the original base proof. This is an inherent property of BBS ProofGen and MUST NOT be weakened by implementation choices.

### 3.5 Verification

**REQ-BBS-040**: The system MUST provide a verification endpoint/function that third-party agents can use to verify derived proofs. This function accepts a Verifiable Presentation and returns a boolean verification result plus the verified claims.

**REQ-BBS-041**: Verification MUST: (a) resolve the issuer's DID to obtain the public key, (b) parse the derived proof, (c) execute BBS ProofVerify via the bbs-2023 cryptosuite, (d) return the verification result.

**REQ-BBS-042**: Verification MUST fail if: the credential has expired, the proof is malformed, the public key does not match, any mandatory disclosure is missing, or the BBS proof verification returns false.

### 3.6 Performance Requirements

**REQ-BBS-050**: Based on published benchmarks for BBS on BLS12-381:

| Operation | Target Latency | Benchmark Reference |
|---|---|---|
| Key generation | < 10 ms | One-time operation |
| Signing (credential issuance, ~20 claims) | < 10 ms | ~0.3 ms per message for BBS Sign |
| Proof generation (selective disclosure) | < 50 ms | ~1.3 ms base + per-disclosed-message overhead |
| Proof verification | < 50 ms | ~1.6 ms base + per-disclosed-message overhead |

**REQ-BBS-051**: End-to-end latency from `agentverse share` command to VP delivery MUST be under 2 seconds on a modern machine (M1+ Mac, or equivalent), excluding network latency to the third-party agent. This budget includes: wallet unlock, credential retrieval, proof generation, VP construction, and A2A message construction.

**REQ-BBS-052**: If the Digital Bazaar pure-JS BBS implementation exceeds REQ-BBS-050 targets by more than 5x, the team MUST benchmark `@mattrglobal/bbs-signatures` (Rust/WASM) as an alternative low-level BBS layer while keeping the Digital Bazaar cryptosuite integration layer.

---

## 4. Verifiable Presentation Generation Requirements

### 4.1 VP Format

**REQ-VP-001**: Verifiable Presentations MUST conform to the W3C Verifiable Credentials Data Model v2.0 `VerifiablePresentation` structure:
```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/security/data-integrity/v2"
  ],
  "type": "VerifiablePresentation",
  "holder": "did:web:localhost:agentverse:user",
  "verifiableCredential": [ /* one or more VCs with derived proofs */ ]
}
```

**REQ-VP-002**: Each VC inside the VP MUST contain a derived Data Integrity proof with `cryptosuite: "bbs-2023"`. The original base proof MUST NOT be included in the VP. Only the derived proof (containing the BBS zero-knowledge proof and the disclosed claims) is transmitted.

**REQ-VP-003**: The VP itself does NOT need an additional outer proof/signature for MVP. The VP is an unsigned envelope containing one or more signed VCs with BBS derived proofs. Rationale: The BBS derived proofs on individual VCs provide the cryptographic assurance. An outer VP signature would add holder binding but would also break unlinkability (the VP signature would be linkable across presentations). VP-level signing is DEFERRED to Phase 2 with the `"anonymous_holder_binding"` feature option.

### 4.2 Including Multiple VCs in a Single VP

**REQ-VP-010**: A single VP MUST support including derived proofs from multiple credentials when a third-party agent requests attributes spanning multiple credential types. Example: a recruiter requests skills (from `AgentverseSkillsCredential`) and location (from `AgentverseBasicProfileCredential`) -- both derived proofs are included in one VP.

**REQ-VP-011**: Each VC in the VP MUST have its own independent derived proof. There is no "combined proof" across multiple VCs in the W3C bbs-2023 cryptosuite. Each derived proof is generated independently from its respective base credential.

**REQ-VP-012**: The Privacy Engine MUST accept a request specifying multiple claim paths across credential types and automatically:
1. Identify which credentials contain the requested claims.
2. Generate a derived proof for each relevant credential, disclosing only the requested claims from that credential.
3. Assemble the derived VCs into a single VP.

**REQ-VP-013**: If a requested claim does not exist in any stored credential, the Privacy Engine MUST return an error indicating the missing claim and MUST NOT silently omit it.

### 4.3 Unlinkability

**REQ-VP-020**: Each derived proof MUST be unlinkable to other derived proofs from the same base credential. This means: if the same user presents their skills to Recruiter A on Monday and Recruiter B on Tuesday, the two BBS proofs MUST be cryptographically independent. Neither recruiter can determine they came from the same credential or the same holder based on the proof values alone.

**REQ-VP-021**: Unlinkability is provided by the BBS ProofGen algorithm, which produces a fresh zero-knowledge proof each time. The system MUST NOT include any additional identifiers or metadata in the derived proof that would break unlinkability.

**REQ-VP-022**: The system MUST document and warn users about residual linkability vectors that BBS+ does NOT protect against:
- **Disclosed claim values**: If both Recruiter A and Recruiter B receive `"python_years: 7"`, they could collude and correlate on the claim value itself.
- **Credential metadata**: The `issuer` DID, `issuanceDate`, and credential `type` are mandatory disclosures and are identical across presentations from the same credential.
- **Number of signed messages**: The BBS specification notes that the total count of originally signed messages is leaked in the proof. If a credential has a unique number of claims, this could be a fingerprint.
- **Timing and network metadata**: IP addresses, request timing, etc. are outside the scope of BBS+ but can enable correlation.

**REQ-VP-023**: To mitigate metadata-based linkability, the system SHOULD:
- Use standardized credential types with consistent structure (so all users' `AgentverseSkillsCredential` has the same number of signed messages, regardless of how many skills they actually have -- pad with null values up to a fixed maximum).
- Consider using the `did:web` DID at a shared domain (e.g., `did:web:agentverse.app:users:...`) rather than a per-user unique domain that would trivially link presentations.

### 4.4 Nonce Handling and Replay Prevention

**REQ-VP-030**: The BBS derived proof MUST include a `presentationHeader` when provided by the verifier. The `presentationHeader` is a byte array that is cryptographically bound into the BBS proof, preventing the proof from being replayed in a different context.

**REQ-VP-031**: For MVP, the system MUST support the following nonce/challenge flow:
1. Third-party agent sends a `presentation_request` (via A2A) containing a `challenge` (random nonce, minimum 16 bytes, hex-encoded).
2. The Privacy Engine includes this `challenge` in the `presentationHeader` when calling BBS ProofGen.
3. The VP includes the `challenge` in a top-level field for the verifier to match.
4. The verifier includes the same `challenge` in the `presentationHeader` when calling BBS ProofVerify.
5. ProofVerify fails if the challenge does not match, preventing replay.

**REQ-VP-032**: If no challenge is provided by the verifier, the Privacy Engine MUST still generate a VP, but the `presentationHeader` will be empty. The VP MUST include a warning field indicating that no replay protection is active.

**REQ-VP-033**: The system MUST NOT reuse a `presentationHeader` across multiple presentations. Each presentation is a unique event with a unique proof.

**REQ-VP-034**: Challenge values received from verifiers MUST have a maximum TTL of 5 minutes. The Privacy Engine MUST reject requests to generate a VP against a challenge older than 5 minutes (to limit the window for relay attacks).

---

## 5. Profile-to-VC Mapping Requirements

### 5.1 Claim Structure

**REQ-MAP-001**: Profile attributes extracted by the Profile Extractor MUST be mapped to W3C VC `credentialSubject` claims using JSON-LD with custom `@context` definitions.

**REQ-MAP-002**: The system MUST define a custom JSON-LD context at `https://agentverse.app/contexts/profile/v1` that defines the Agentverse-specific claim vocabulary. For MVP, this context is served as a static file (bundled with the CLI) and resolved locally by the document loader.

**REQ-MAP-003**: Where applicable, claims MUST reference existing vocabularies:
- `schema:knowsLanguage` (from schema.org) for language proficiency
- `schema:knowsAbout` (from schema.org) for topic expertise
- `schema:homeLocation` (from schema.org) for location
- Custom Agentverse vocabulary for claims without schema.org equivalents

### 5.2 Claim Granularity and Nesting

**REQ-MAP-010**: Skills MUST be represented as an array of structured objects, NOT as a flat string or a single array of skill names. Each skill object MUST contain:

```json
{
  "@type": "AgentverseSkill",
  "skillName": "Python",
  "yearsExperience": 7,
  "proficiencyLevel": "advanced",
  "lastMentioned": "2026-03-10T00:00:00Z",
  "confidence": 0.92,
  "sourceCount": 15
}
```

**REQ-MAP-011**: The `proficiencyLevel` field MUST use one of: `"beginner"`, `"intermediate"`, `"advanced"`, `"expert"`. These are derived by the Profile Extractor from conversation context.

**REQ-MAP-012**: The `confidence` field (0.0 to 1.0) MUST reflect the Profile Extractor's confidence in the claim, based on: number of mentions (`sourceCount`), recency, consistency across conversations, and explicit vs. implicit mention.

**REQ-MAP-013**: The `lastMentioned` field MUST record the timestamp of the most recent conversation in which this attribute was mentioned or implied. This serves as a freshness indicator.

**REQ-MAP-014**: Each field within a skill object MUST be independently selectively disclosable. A user MUST be able to disclose `skillName: "Python"` and `proficiencyLevel: "advanced"` without disclosing `yearsExperience`, `confidence`, or `sourceCount`. This is achieved by using JSON pointers that address individual nested fields (e.g., `/credentialSubject/skills/0/skillName`).

**REQ-MAP-015**: Interests MUST be represented as an array of structured objects:

```json
{
  "@type": "AgentverseInterest",
  "interestName": "hiking",
  "category": "outdoor-activities",
  "intensity": "passionate",
  "lastMentioned": "2026-03-12T00:00:00Z",
  "confidence": 0.88
}
```

**REQ-MAP-016**: The `intensity` field MUST use one of: `"casual"`, `"moderate"`, `"passionate"`. Derived from frequency and enthusiasm of mentions.

**REQ-MAP-017**: Location MUST be represented at city-level granularity, NOT street address:

```json
{
  "@type": "AgentverseLocation",
  "city": "San Francisco",
  "region": "California",
  "country": "US",
  "confidence": 0.95,
  "lastMentioned": "2026-03-01T00:00:00Z"
}
```

**REQ-MAP-018**: The system MUST NOT extract or store: street addresses, zip codes, GPS coordinates, or any location more specific than city-level. This is a privacy-by-design constraint.

**REQ-MAP-019**: Age MUST be stored as a range, NOT an exact value:

```json
{
  "@type": "AgentverseAgeRange",
  "ageRangeLower": 25,
  "ageRangeUpper": 30,
  "confidence": 0.70,
  "lastMentioned": "2026-01-15T00:00:00Z"
}
```

### 5.3 Credential Subject Structure (Full Examples)

**REQ-MAP-030**: `AgentverseSkillsCredential` structure:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/security/data-integrity/v2",
    "https://agentverse.app/contexts/profile/v1"
  ],
  "id": "urn:uuid:a1b2c3d4-...",
  "type": ["VerifiableCredential", "AgentverseSkillsCredential"],
  "issuer": "did:web:localhost:agentverse:user",
  "issuanceDate": "2026-03-15T12:00:00Z",
  "expirationDate": "2026-06-13T12:00:00Z",
  "credentialSubject": {
    "id": "did:web:localhost:agentverse:user",
    "skills": [
      {
        "@type": "AgentverseSkill",
        "skillName": "Python",
        "yearsExperience": 7,
        "proficiencyLevel": "advanced",
        "lastMentioned": "2026-03-10T00:00:00Z",
        "confidence": 0.92,
        "sourceCount": 15
      },
      {
        "@type": "AgentverseSkill",
        "skillName": "TypeScript",
        "yearsExperience": 4,
        "proficiencyLevel": "advanced",
        "lastMentioned": "2026-03-14T00:00:00Z",
        "confidence": 0.95,
        "sourceCount": 23
      }
    ]
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "bbs-2023",
    "verificationMethod": "did:web:localhost:agentverse:user#bls12-381-key",
    "proofPurpose": "assertionMethod",
    "proofValue": "u..."
  }
}
```

**REQ-MAP-031**: Skills arrays MUST be padded to a fixed length (default: 20 entries) with null/empty skill objects to prevent the number of skills from being a fingerprinting vector (see REQ-VP-023). Empty skill entries MUST be structurally identical to real entries but with null values. The selective disclosure mechanism will never select these padding entries.

### 5.4 Timestamps and Freshness

**REQ-MAP-040**: Every claim MUST include a `lastMentioned` timestamp indicating when the attribute was most recently observed in conversation history.

**REQ-MAP-041**: Every claim MUST include a `confidence` score (0.0-1.0) reflecting extraction confidence.

**REQ-MAP-042**: The `issuanceDate` on the credential reflects when the VC was issued (signed). The `lastMentioned` on individual claims reflects when the underlying data was last observed. These are distinct timestamps with distinct meanings and MUST NOT be conflated.

**REQ-MAP-043**: Verifiers SHOULD treat claims with `lastMentioned` older than 90 days as potentially stale. The system SHOULD surface this to the user when generating presentations: "Warning: your 'Python' skill claim was last mentioned 4 months ago. Consider re-extracting your profile."

### 5.5 Schema Extensibility

**REQ-MAP-050**: The custom JSON-LD context MUST define all Agentverse-specific types and properties with stable IRIs. Terms MUST NOT change meaning between versions.

**REQ-MAP-051**: New claim types MUST be addable by extending the context without breaking existing credentials. The context MUST use versioned URLs (`/v1`, `/v2`).

**REQ-MAP-052**: The system MUST NOT use schema.org types directly as credential types (e.g., do not use `schema:Person` as a credential type). Instead, use Agentverse-specific types that reference schema.org properties where applicable. This avoids semantic confusion between a schema.org `Person` and an Agentverse profile credential.

---

## 6. MVP Boundaries

### 6.1 What IS in MVP

| Feature | Description | Key Requirements |
|---|---|---|
| **Credential Wallet (local, encrypted)** | JSON-LD VC storage on local filesystem with AES-256-GCM encryption, passphrase-derived key | REQ-CW-001 through REQ-CW-008 |
| **BLS12-381 key pair management** | Single key pair for signing and proof derivation, encrypted storage, backup/restore | REQ-CW-010 through REQ-CW-016 |
| **Self-issued credentials** | User's agent issues VCs over extracted profile claims, issuer = subject | REQ-CW-020 through REQ-CW-023 |
| **BBS+ signing via bbs-2023 cryptosuite** | Base proof creation using Digital Bazaar's implementation | REQ-BBS-020 through REQ-BBS-023 |
| **Selective disclosure via BBS+ ProofGen** | Derived proof creation with JSON pointer-based claim selection | REQ-BBS-030 through REQ-BBS-033 |
| **Verifiable Presentation construction** | W3C VP envelope with one or more VCs containing BBS derived proofs | REQ-VP-001 through REQ-VP-013 |
| **Nonce-based replay prevention** | Verifier-supplied challenge bound into presentationHeader | REQ-VP-030 through REQ-VP-034 |
| **Domain-level credential granularity** | Four credential types: Skills, Interests, Preferences, BasicProfile | REQ-CW-050 through REQ-CW-053 |
| **Profile-to-VC mapping** | Structured claims with nested objects, confidence scores, freshness timestamps | REQ-MAP-001 through REQ-MAP-052 |
| **Credential re-issuance on profile change** | New credential issued when claims change; old credential superseded | REQ-CW-043 through REQ-CW-045 |
| **Credential expiration** | 90-day default TTL; expired credentials blocked from presentation | REQ-CW-033, REQ-CW-039 |
| **Wallet backup/restore** | Encrypted export/import of keys and credentials | REQ-CW-015, REQ-CW-016 |
| **Baseline BBS feature option only** | No anonymous holder binding or pseudonyms | REQ-BBS-023 |

### 6.2 What is EXPLICITLY DEFERRED

| Feature | Deferred To | Rationale |
|---|---|---|
| **ZKP predicate proofs** (e.g., "age >= 18") | Phase 2 | Requires Noir circuit development, Barretenberg backend integration. BBS+ selective disclosure is sufficient for MVP -- disclose the `ageRange` field instead of proving a predicate. |
| **Revocation registries** (Bitstring Status List) | Phase 2 | Self-issued credentials with TTL-based expiration are sufficient for MVP. Formal revocation requires infrastructure (status list hosting, verifier polling). |
| **Hierarchical key derivation** | Phase 2 | Single key pair is sufficient for a single-user CLI tool. HD keys needed when supporting multiple personas or device sync. |
| **Key rotation** | Phase 2 | Requires re-issuance of all credentials and DID Document update. Low urgency for MVP where TTL is 90 days. |
| **Anonymous holder binding** | Phase 2 | BBS bbs-2023 `"anonymous_holder_binding"` feature option. Useful for proving the presenter is the legitimate holder without revealing their identity. Not needed for MVP where the holder is known. |
| **Pseudonym-based linkability** | Phase 2 | BBS bbs-2023 `"pseudonym"` feature option. Enables domain-specific pseudonyms for controlled re-identification within a single verifier relationship. |
| **VP-level signing** | Phase 2 | An outer proof on the VP that binds the VP to the holder. Currently breaks unlinkability. Needed when holder binding is required. |
| **Third-party issued credentials** | Phase 2 | Wallet architecturally supports them, but no issuance flow from external parties is built in MVP. |
| **FHE (Fully Homomorphic Encryption)** | Phase 3 | 10,000x-1,000,000x overhead on CPUs. Not practical for CLI tool today. |
| **MPC (Secure Multi-Party Computation)** | Phase 3 | Requires interactive protocols between agents. Higher latency. Useful for compatibility scoring on encrypted data. |
| **Composite proofs across credentials** | Phase 3 | Proving relationships between claims in different credentials (e.g., "skill X in credential A and location Y in credential B belong to the same holder"). Requires advanced proof systems (Dock Network's composite proof framework or similar). |
| **Accumulator-based revocation** | Phase 3 | Cryptographic accumulators for privacy-preserving revocation checks. Requires infrastructure. |
| **Hardware Security Module (HSM) integration** | Phase 3 | Platform keychain or hardware key storage. Important for production but not for CLI MVP. |
| **OpenID4VP (Verifiable Presentations over OpenID)** | Phase 3 | Standardized presentation exchange protocol. The MVP uses A2A protocol directly. OpenID4VP adds interoperability with existing identity ecosystems. |

### 6.3 Minimum Viable Credential Flow

The end-to-end MVP flow for credentials is:

```
1. INITIALIZE
   agentverse init
   -> Generate BLS12-381 key pair
   -> Create wallet directory structure
   -> Create did:web DID Document with public key
   -> User sets passphrase for wallet encryption

2. EXTRACT & ISSUE
   agentverse profile extract --source claude-code
   -> Profile Extractor reads ~/.claude/conversation_history/*.jsonl
   -> Produces structured claims (skills, interests, preferences, basic profile)
   -> Credential Wallet issues 4 BBS+-signed VCs (one per domain)
   -> VCs stored encrypted in ~/.agentverse/wallet/credentials/

3. REVIEW
   agentverse wallet list
   -> Shows 4 credentials with types, claim counts, dates
   agentverse wallet show <credential-id>
   -> Shows all claims in a specific credential

4. SHARE (Selective Disclosure)
   agentverse share --with ditto.ai --claims interests,ageRange
   -> Fetch and verify Ditto AI's Agent Card
   -> Consent Manager evaluates and prompts user
   -> User approves
   -> Privacy Engine:
      a. Finds AgentverseInterestsCredential and AgentverseBasicProfileCredential
      b. Generates BBS+ derived proof for interests (selective pointers)
      c. Generates BBS+ derived proof for age range (selective pointers)
      d. Assembles VP with both derived VCs
      e. Includes verifier's challenge in presentationHeader
   -> A2A Client sends VP to Ditto AI's endpoint
   -> Audit log records the sharing event

5. VERIFY (Third-party side)
   -> Ditto AI receives VP
   -> Resolves issuer DID, obtains public key
   -> Verifies each BBS+ derived proof via bbs-2023 cryptosuite
   -> Extracts disclosed claims
   -> Uses claims for its application logic

6. REFRESH (When profile changes)
   agentverse profile refresh
   -> Re-extracts profile from latest conversation history
   -> Diffs against existing credentials
   -> Re-issues credentials for changed claims only
   -> Old credentials marked superseded, retained for grace period
```

### 6.4 Open Design Questions for Implementation Phase

These questions are identified but need not be resolved before implementation begins -- they should be resolved during implementation with working code:

1. **Array padding strategy**: REQ-MAP-031 specifies padding skills arrays to 20 entries. The exact padding structure needs testing to confirm it does not break JSON-LD canonicalization or BBS signing. Alternative: use a fixed schema with 20 skill slots, each with a `populated: true/false` flag.

2. **Document loader strategy**: The custom JSON-LD context (`https://agentverse.app/contexts/profile/v1`) needs a document loader that resolves this URL locally (from a bundled context file) rather than over HTTP. The Digital Bazaar libraries support custom document loaders.

3. **DID:web for localhost**: For MVP, the user's DID is `did:web:localhost:agentverse:user`. This works locally but is not resolvable by remote verifiers. For the MVP demo, the verifier will need the public key provided out-of-band (included in the VP or fetched via A2A). Production DID resolution is a Phase 2 concern.

4. **Performance validation**: Benchmark the Digital Bazaar BBS implementation against REQ-BBS-050 targets early in development. If it is too slow, evaluate the MATTR WASM alternative before building significant integration.

---

## Appendix: Specification References

- [IRTF BBS Signature Scheme (draft-irtf-cfrg-bbs-signatures-10)](https://datatracker.ietf.org/doc/draft-irtf-cfrg-bbs-signatures/)
- [W3C Data Integrity BBS Cryptosuites v1.0 (Candidate Recommendation)](https://w3c.github.io/vc-di-bbs/)
- [W3C Verifiable Credentials Data Model v2.0 (Recommendation)](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C Verifiable Credential Data Integrity 1.0 (Recommendation)](https://www.w3.org/TR/vc-data-integrity/)
- [IRTF BBS Blind Signatures (draft-02)](https://datatracker.ietf.org/doc/draft-irtf-cfrg-bbs-blind-signatures/)
- [IRTF BBS Per-Verifier Linkability (draft-02)](https://datatracker.ietf.org/doc/draft-irtf-cfrg-bbs-per-verifier-linkability/)
- [@digitalbazaar/bbs-2023-cryptosuite (npm)](https://www.npmjs.com/package/@digitalbazaar/bbs-2023-cryptosuite)
- [@digitalbazaar/bbs-signatures (npm)](https://www.npmjs.com/package/@digitalbazaar/bbs-signatures)
- [@digitalbazaar/bls12-381-multikey (GitHub)](https://github.com/digitalbazaar/bls12-381-multikey)
- [@digitalbazaar/vc (npm)](https://www.npmjs.com/package/@digitalbazaar/vc)
- [@mattrglobal/bbs-signatures (npm)](https://www.npmjs.com/package/@mattrglobal/bbs-signatures)
- [@mattrglobal/pairing-crypto (GitHub)](https://github.com/mattrglobal/pairing_crypto)
- [@docknetwork/crypto-wasm-ts (GitHub)](https://github.com/docknetwork/crypto-wasm-ts)
- [BBS+ Performance Benchmarks (Dyne.org)](https://news.dyne.org/benchmark-of-the-bbs-signature-scheme-v06/)
- [BBS Signatures - Privacy by Design (MATTR)](https://mattr.global/article/bbs-signatures---a-building-block-for-privacy-by-design)
- [W3C Bitstring Status List v1.1](https://w3c.github.io/vc-bitstring-status-list/)
- [W3C VC Revocation List 2020](https://w3c-ccg.github.io/vc-status-rl-2020/)
- [Privacy-preserving BBS+ for Digital Identity (Worldline)](https://blog.worldline.tech/2024/05/14/bbs-plus-credentials.html)
