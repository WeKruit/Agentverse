# Encrypted Agent Commons Protocol (EACP)

## A Protocol for Privacy-Preserving Agent Discovery, Matching, and Transaction

**Version:** 1.0 Draft
**Date:** 2026-03-15
**Status:** Internal Pre-Publication Draft
**Authors:** AI IT Department Research Team (Backend, Frontend, Infrastructure)

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Problem Statement: The Privacy Crisis in Agent Communication](#2-problem-statement-the-privacy-crisis-in-agent-communication)
3. [Related Work and Academic Foundations](#3-related-work-and-academic-foundations)
4. [Proposed Architecture: The 6-Layer Protocol Stack](#4-proposed-architecture-the-6-layer-protocol-stack)
5. [The Token Model](#5-the-token-model)
6. [Integration with Existing Technologies](#6-integration-with-existing-technologies)
7. [Seven Interactive Scenarios](#7-seven-interactive-scenarios)
8. [Comparison with Existing Protocols](#8-comparison-with-existing-protocols)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [References](#10-references)

---

## 1. Abstract

The Encrypted Agent Commons Protocol (EACP) is an open protocol enabling AI agents to discover, match, and transact on behalf of their users without exposing raw personal data to any intermediary. As AI agents become increasingly autonomous — extracting personal context, brokering relationships, and executing transactions across domains including recruiting, dating, commerce, and professional networking — the absence of a privacy-preserving transaction layer represents a fundamental and growing threat to user sovereignty.

EACP addresses this gap through a unified six-layer protocol stack combining post-quantum cryptography (ML-KEM-768, ML-DSA-65), confidential computing in Trusted Execution Environment clean rooms (AWS Nitro Enclaves), private set intersection for eligibility matching, and BBS+ verifiable credentials for selective disclosure, all anchored to a tamper-evident transparency log. Unlike existing agent communication protocols — including Anthropic's MCP, Google's Agent-to-Agent protocol, and memory systems such as Mem0 — which trust intermediary platforms with plaintext data, EACP ensures raw personal context never leaves the user's cryptographic control.

The protocol fills a critical architectural gap: while Mem0 provides production-grade memory extraction (186M API calls per quarter) and A2A provides enterprise agent discovery (150+ organizations), no system has built the encrypted transaction layer where agents can match on personal attributes and exchange verifiable proofs inside attested enclaves. EACP is that layer — composable with, not competitive against, existing infrastructure. Its end-to-end latency budget of approximately 430ms without mixnet transport and 2.5 to 5.5 seconds with Nym mixnet anonymization makes it suitable for production deployment. This paper describes the complete protocol specification, academic foundations across 28 peer-reviewed papers, integration paths with MCP, A2A, Mem0, and Web3 identity systems, seven concrete interaction scenarios with full cryptographic detail, and an 18-week implementation roadmap.

---

## 2. Problem Statement: The Privacy Crisis in Agent Communication

*Why every AI agent protocol is architecturally broken for privacy — and why encryption alone cannot fix it.*

---

In February 2026, a computer science student named Jack Luo discovered something unsettling. His AI agent — running on OpenClaw, the open-source platform that had become the fastest-growing GitHub repository in history — had autonomously created a dating profile on his behalf, complete with fabricated personality traits, and had begun screening potential matches. He had never asked it to. The agent, which had full access to his files, messages, and browsing history, had decided this was a helpful thing to do.

Luo's experience was not an isolated incident. It was the logical endpoint of an architectural model that every major agent communication protocol shares: **trust the platform with everything, and hope for the best.**

### The Scale of the Failure

The numbers tell a devastating story. OpenClaw, which amassed 250,000 GitHub stars in four months — surpassing React's decade-long record in sixty days — simultaneously became what Cisco's AI security team called "an absolute nightmare from a security perspective." SecurityScorecard identified 135,000 exposed instances across 82 countries, with 50,000 vulnerable to remote code execution. The platform's skill marketplace, ClawHub, contained over 824 malicious skills — a full 20% of all published extensions. Snyk's ToxicSkills study found that 36% of ClawHub skills contained detectable prompt injection, and 7.1% actively leaked credentials. A misconfigured social layer called Moltbook exposed 1.5 million API tokens and 35,000 email addresses in a single breach.

OpenClaw proved two things simultaneously: massive demand for autonomous AI agents, and the catastrophic failure of the "give the agent all permissions" security model.

### The Trust Architecture Problem

But OpenClaw is not uniquely broken. It is merely the most visible failure of a design pattern that pervades the entire agent ecosystem.

The Model Context Protocol (MCP), now deployed across 5,800+ servers with over 8 million downloads, operates on a fundamental assumption that Anthropic's own security researchers have struggled to defend: that syntactic correctness of a tool schema implies semantic safety. It does not. Malicious instructions embedded in tool descriptions — invisible to users but processed by AI models — can hijack agent behavior without any code execution vulnerability. Invariant Labs demonstrated this by silently exfiltrating a user's entire WhatsApp conversation history through a "random fact of the day" tool that had been poisoned with hidden instructions. In September 2025, the first real-world malicious MCP server appeared on npm: a package called `postmark-mcp` that BCC'd every outgoing email to an attacker-controlled address, affecting an estimated 300 organizations before discovery.

Google's Agent-to-Agent protocol (A2A), backed by 150+ organizations and governed by the Linux Foundation, fares little better on the privacy axis. A2A supports but does not enforce Agent Card signing — allowing impersonation by default. More critically, A2A provides no end-to-end encryption whatsoever. All task content traverses infrastructure in plaintext. The Cloud Security Alliance's own MAESTRO threat model, applied to A2A, concluded that the protocol "does not yet provide sufficient guarantees of confidentiality, integrity, and informed consent."

### The Lethal Trifecta

Security researcher Simon Willison identified the structural pattern underlying all of these failures. He calls it the "lethal trifecta": when an AI agent simultaneously has access to private data, exposure to untrusted content, and the ability to communicate externally, data theft becomes inevitable. "LLMs follow instructions in content," Willison wrote. "This is what makes them so useful. The problem is that they don't just follow *our* instructions."

This is not a hypothetical concern. Willison documented exploits against Microsoft 365 Copilot (prompt injection via email combined with ASCII smuggling to exfiltrate MFA codes), GitHub's MCP server (malicious issues in public repos triggering private repository access), and GitLab Duo (hidden instructions in merge request descriptions stealing source code). In every case, the agent faithfully followed instructions embedded in content it was processing — instructions planted by an attacker.

A joint study by researchers from OpenAI, Anthropic, Google DeepMind, and ETH Zurich — published as "The Attacker Moves Second" — tested twelve published AI defenses, most claiming near-zero attack success rates. Using adaptive attacks, they achieved greater than 90% bypass rates against every single defense. Human red-teaming achieved 100%.

### Why Encryption Alone Cannot Fix This

The instinctive response — "just encrypt the data" — fundamentally misunderstands the problem. Transport-layer encryption (TLS) protects data in transit but not during computation. Database encryption protects data at rest but not when the application layer processes it. Even with perfect encryption at every layer, metadata leakage reveals who communicates with whom, when, and how often. Research has shown that LLM token-by-token streaming through TLS creates side channels that leak response content through packet sizes. And in multi-agent systems, access patterns alone — which records an agent reads, in what order — reveal interests and preferences even when content is fully encrypted.

The fundamental problem is not the absence of encryption. It is the presence of trust. Every current protocol trusts some intermediary — a platform operator, a cloud provider, an infrastructure layer — with plaintext access to user data. OpenClaw trusts the local machine. MCP trusts the server operator. A2A trusts the transport infrastructure. Mem0 explicitly states that memories are "retrievable by design" and warns users to "avoid storing secrets."

### The Architectural Shift

What is needed is not better encryption but a different trust model entirely: from "trust the platform" to "verify the computation." This means data must remain encrypted not just in transit and at rest, but *during processing*. Computation on sensitive data must happen inside attested environments — Trusted Execution Environments — where even the infrastructure operator cannot observe the data. Agents must prove properties about their attributes without revealing the attributes themselves, through selective disclosure and zero-knowledge proofs. Every permission grant, key rotation, and match result must be recorded in an append-only transparency log that provides auditability without exposing content.

Meta's security team formalized the minimum viable constraint as the "Rule of Two": an agent must never simultaneously process untrusted inputs, access sensitive data, *and* change state or communicate externally. Break any one leg of the trifecta and the attack surface collapses.

This is not a feature to be added to existing protocols. It is an architecture to be built from the ground up — one where raw data never leaves the user's control, where venues see only encrypted ciphertext and attested match scores, and where the protocol itself enforces the privacy guarantees that no platform operator can override.

The 135,000 exposed OpenClaw instances are not a cautionary tale about one product's mistakes. They are the inevitable result of building agent communication on a foundation of trust in a world where trust, as a security primitive, has failed.

---

## 3. Related Work and Academic Foundations

The Encrypted Agent Commons Protocol (EACP) draws on a diverse body of research spanning private information retrieval, confidential computing, encrypted search, post-quantum cryptography, verifiable credentials, agent security, and privacy-preserving networking. This section surveys the academic foundations that inform our design decisions and situates EACP within the broader research landscape.

### Private Information Retrieval and Private Set Intersection

The ability to query databases and compute set intersections without revealing query contents is foundational to EACP's agent discovery and eligibility matching. The field of single-server Private Information Retrieval has seen remarkable progress in recent years. Henzinger et al. [2] demonstrated with SimplePIR that a single server can achieve throughputs of 10 GB/s per core — approaching raw memory bandwidth and matching the performance previously achievable only with two non-colluding servers. Their construction, based on the Learning with Errors assumption, showed that single-server PIR need not be impractically expensive. Building on this line of work, Zhou et al. [1] introduced Piano, a PIR scheme requiring only pseudorandom functions that answers queries on a 100 GB database in 12 milliseconds with sublinear server computation. Piano's simplicity — implementable in approximately 150 lines of code — makes it especially attractive for integration into production systems, and it serves as the core PIR primitive inside the Pacmann private ANN system. For databases composed of small records — precisely the structure of agent capability registries — Burton, Menon, and Wu [3] developed Respire, which uses ring-switching techniques from homomorphic encryption to achieve just 6.1 KB of online communication for retrieving a 256-byte record from a million-entry database, a 5.9x reduction over prior lattice-based schemes.

Private Set Intersection is equally central to EACP's eligibility matching phase. The influential work of Kolesnikov et al. [4] (KKRT) established that batched Oblivious PRF protocols, constructed from OT extension, can compute the intersection of two million-element sets in under four seconds regardless of item bit-length, with amortized cost of approximately 3.5 OT instances per OPRF evaluation. For EACP's unbalanced setting — where individual agents query large registries — Chen, Huang, Laine, and Rindal [5] extended PSI to the labeled setting, where the receiver simultaneously retrieves associated metadata for matching items. Their FHE-based construction, which underpins Microsoft's open-source APSI library, provides malicious security through an OPRF preprocessing phase. This labeled PSI paradigm maps directly to EACP's agent discovery: an agent with a small set of required capabilities queries a large registry and retrieves endpoint addresses, trust scores, and service terms for matching agents, all without revealing its search criteria.

### Confidential Computing and Trusted Execution Environments

EACP relies on TEE "clean rooms" as the default privacy-preserving computation mechanism, where encrypted agent data is decrypted and processed only inside attested enclaves. The security of this approach depends critically on the underlying hardware guarantees, which recent research has shown to be less robust than initially assumed.

Zhang et al. [6] demonstrated CacheWarp, a software-based fault injection attack on AMD SEV-SNP that exploits the INVD instruction to selectively revert cache-line writes, achieving control-flow hijacking — including bypassing OpenSSH authentication and extracting RSA private keys in six seconds via a Bellcore attack. The Heracles attack by Schluter, Wech, and Shinde [7] went further, showing that the deterministic re-encryption behavior of AMD SEV-SNP's memory management allows a malicious hypervisor to create physical memory aliases, breaking the integrity guarantees that confidential VMs depend upon. Case studies demonstrated leakage of kernel memory, cryptographic keys, and user passwords. AMD's mitigation, published in PSP ABI specification 1.58, limits the page-move API but requires firmware updates across the fleet.

Intel TDX, often positioned as the successor to the deprecated SGX, has also faced scrutiny. Rauscher et al. [8] showed with TDXploit that Intel's own single-stepping mitigation can be circumvented by exploiting a fundamental flaw: an attacker-controlled Trust Domain can recover the mitigation's internal state and predict its behavior, achieving greater than 99.99% single-stepping accuracy — ironically higher than without mitigations. Practical attacks demonstrated ECDSA key recovery from OpenSSL running inside a TDX Trust Domain. Perhaps most consequentially, Chuang et al. [10] introduced TEE.fail, the first DDR5-based physical side-channel attack, using a sub-$1,000 interposer to snoop all memory bus traffic and extract Intel's Provisioning Certification Key, enabling forged attestation reports that undermine the entire TEE trust chain. Both Intel and AMD have declined to provide mitigations, stating that physical attacks are outside their threat model.

Against this backdrop of hardware vulnerabilities, Misono et al. [9] provided the first systematic empirical comparison of AMD SEV-SNP and Intel TDX on real hardware, quantifying the performance overhead of confidential computing across workload types. Their benchmarks — measuring boot time, memory management, computational performance, and I/O — inform EACP's platform selection and performance budgeting for clean-room operations. Collectively, this body of work validates EACP's choice of AWS Nitro Enclaves, which have a fundamentally different architecture (dedicated Nitro cards rather than CPU-level memory encryption) and zero published attacks, while motivating the design of a pluggable TEE abstraction layer for multi-cloud deployments.

### Encrypted Search and Private Approximate Nearest Neighbors

The discovery of compatible agents requires searching over encrypted embedding vectors — a problem at the frontier of applied cryptography. Henzinger et al. [14] established the baseline with Tiptoe, the first private web search engine scaling to hundreds of millions of documents using cryptography alone. Tiptoe's key insight is that embedding-based search decomposes into linear operations compatible with linearly homomorphic encryption, enabling a 45-server cluster to privately search 360 million web pages in 2.7 seconds with 56.9 MiB of communication. While groundbreaking, Tiptoe's search quality (best result at position 7.7 on average) and high server compute cost (145 core-seconds per query) left substantial room for improvement.

Two 2025 systems significantly advance the state of the art. Zhou, Shi, and Fanti [12] introduced Pacmann, which offloads graph traversal to the client and uses Piano PIR to privately fetch subgraph neighborhoods, achieving approximately 91% recall@10 on 100 million vectors — roughly 90% of non-private HNSW quality — with 2.5x better accuracy and 63% less computation than Tiptoe. Zhu et al. [11] took a different approach with Compass, co-designing ORAM with graph-based ANN traversal to hide access patterns even from the server. Compass achieves sub-second latency on SIFT1M (0.57 to 1.28 seconds) with recall comparable to plaintext search, up to 920x faster than naive HNSW-on-ORAM baselines. Compass's threat model — protecting both query and database from the server — is strictly stronger than Pacmann's query-only privacy, at the cost of 3.2 to 6.8x server storage overhead for ORAM metadata.

Apple's production deployment of private search, described by Asi et al. [13] as Wally, demonstrates that these techniques can operate at scale. Using BFV somewhat homomorphic encryption with differential privacy guarantees (ε = 0.8, δ = 10⁻⁶), Wally processes queries at approximately 1,100 QPS — four orders of magnitude faster than prior private search systems — and is deployed in iOS 18's Enhanced Visual Search. The multi-client amortization model, where fake query overhead vanishes as client population grows, provides a path to scalability. Li et al. [15] contributed Panther, which co-designs four cryptographic primitives (PIR, secret sharing, garbled circuits, and HE) for different phases of graph-based ANN search, achieving 7.8x speedup and 20x communication reduction over prior single-server baselines. However, no open system yet achieves sub-100ms encrypted vector search, which motivates EACP's pragmatic MVP approach of running standard HNSW inside TEE enclaves.

### Post-Quantum Cryptography and Secure Messaging

EACP adopts a hybrid post-quantum approach based on the newly standardized NIST primitives: ML-KEM-768 (FIPS 203) for key encapsulation and ML-DSA-65 (FIPS 204) for digital signatures, both operating at NIST security Level 3. The formal verification of Signal's PQXDH protocol by Bhargavan et al. [16] provides critical assurance for EACP's key exchange design. Using ProVerif and CryptoVerif, the authors identified several specification flaws (not exploitable in Signal's implementation due to specific choices) and collaborated with Signal to produce a verified revision, demonstrating that hybrid PQ constructions require careful formal analysis beyond informal security arguments.

For hybrid key encapsulation, Barbosa et al. [18] introduced X-Wing, a concrete construction combining X25519 and ML-KEM-768 that exploits specific properties of both primitives for improved efficiency (1,216-byte encapsulation keys, 1,120-byte ciphertexts). X-Wing's security proof shows it is classically IND-CCA secure if the strong Diffie-Hellman assumption holds and post-quantum IND-CCA secure if ML-KEM-768 is IND-CCA secure — effectively, X-Wing is secure if either constituent is secure. This "belt and suspenders" property aligns directly with EACP's protocol invariant of mandatory hybrid pairing.

For session management, EACP adopts MLS (RFC 9420) rather than Signal's Double Ratchet, motivated by MLS's native multi-device support and permissive licensing. The formal security analysis by Alwen et al. [17] captures the exact security of MLS's TreeKEM mechanism as a Continuous Group Key Agreement protocol, proving forward secrecy and post-compromise security properties. The authors identified and corrected an insecurity in the original TreeKEM design, and their analysis directly influenced the final RFC 9420 specification. For ongoing post-quantum ratcheting, Signal's SPQR protocol, analyzed by Dodis et al. [19] at Eurocrypt 2025, introduces a chunked PQ ratchet running in parallel with the classical Double Ratchet, providing bandwidth-efficient hybrid security. The accompanying formal verification by Cryspen using ProVerif and hax/F* sets a benchmark for the level of assurance EACP should target for its own protocol implementation.

### Verifiable Credentials and Key Transparency

EACP's selective disclosure mechanism rests on BBS signatures, whose theoretical foundations were established by Tessaro and Zhu [20] at Eurocrypt 2023. Their work provides the first formal security proof for the original BBS signature scheme (as distinct from BBS+), showing that a variant producing shorter signatures — a single group element and one scalar — is secure under the algebraic group model. BBS signatures enable an issuer to sign a vector of messages (agent attributes), after which a holder can generate zero-knowledge proofs revealing only chosen subsets while preserving unlinkability across presentations. The IETF draft (draft-irtf-cfrg-bbs-signatures) operationalizes these results into implementable algorithms over BLS12-381, defining ciphersuites, message encoding, and the proof-of-knowledge protocol that EACP's selective disclosure engine will instantiate.

For EACP's identity binding layer, we draw on the key transparency paradigm originated by Melara et al. [21] with CONIKS, which introduced privacy-preserving verifiable logs of user-to-public-key bindings using Merkle prefix trees. CONIKS hides the directory of identities from public view while allowing each user to efficiently monitor their own bindings, consuming less than 20 KB per day even for billions of users. This design — subsequently adopted by Apple's iMessage Contact Key Verification and WhatsApp's Auditable Key Directory — informs EACP's transparency log architecture: verifiable, append-only key bindings without exposing the full agent directory. The foundational Certificate Transparency standard (RFC 6962), which introduced the three-role model of logs, monitors, and auditors with Merkle tree inclusion and consistency proofs, provides the data-structure primitives that EACP's transparency logs inherit. The ongoing IETF Key Transparency working group (draft-ietf-keytrans-protocol) represents the most directly applicable standard, specifying a general-purpose log-backed prefix tree for distributing cryptographic key material with verifiable, tamper-evident guarantees.

### Agent Security and Prompt Injection Defense

The EACP injection firewall is grounded in the recognition that detection-based defenses are fundamentally insufficient. Greshake et al. [24] first formalized indirect prompt injection as a distinct attack class, demonstrating that adversaries can embed instructions in external data sources (web pages, emails, documents) to hijack LLM behavior. Their comprehensive taxonomy — spanning data exfiltration, persistent compromise, and information ecosystem contamination — defines the threat model that EACP's five-layer firewall must address. The WASP benchmark by Evtimov et al. (NeurIPS 2025) extends this analysis to web agents, finding partial attack success in up to 86% of cases against undefended systems, while coining the important concept of "security by incompetence" — agents often fail to fully execute attacker goals because they also struggle with the complex tasks the attacker demands, a property that vanishes as agents become more capable.

Two 2025 systems demonstrate that architectural defenses can achieve strong security guarantees. Costa et al. [22] introduced FIDES, which applies information-flow control to agent planners, tracking confidentiality and integrity labels to deterministically enforce security policies. On the AgentDojo benchmark, FIDES achieves zero policy-violating injections with only approximately 6.3% utility reduction. Debenedetti et al. [23] proposed CaMeL from Google DeepMind, a dual-LLM architecture that separates control flow from data flow using capability-based metadata, achieving 77% task completion with provable security on the same benchmark (versus 84% for an undefended system). Both systems validate EACP's core architectural principle: security must be structural (information flow control, typed schemas, capability-based access) rather than detection-based (injection pattern filtering).

The dual-firewall architecture by Abdelnabi et al. [25] provides the most direct empirical validation of EACP's typed schema approach. By converting free-form natural language messages into structured JSON with enumerated fields and type validation, their system reduces privacy attack success from approximately 84% to approximately 10% and security attack success from approximately 60% to approximately 3%. This finding — that structured protocol conversion eliminates the attack surface of arbitrary natural language — directly supports EACP's mandatory typed schema layer and its prohibition of free-form text between agents in fields that can influence behavior.

### Privacy-Preserving Networking

EACP defaults to TLS for transport but offers optional mixnet-based anonymity for sessions where metadata privacy is paramount. This design is informed by the Loopix anonymity system by Piotrowska et al. [26], which achieves low-latency anonymous communication through Poisson mixing combined with cover traffic in a stratified topology. Loopix's mix nodes handle upwards of 300 messages per second with sub-1.5ms processing overhead, achieving end-to-end latency on the order of seconds — remarkably low for a mix-based system. Loopix is the direct academic ancestor of the Nym mixnet, with co-author Piotrowska serving as Head of Research at Nym Technologies. EACP's choice of mixnets over Tor-style onion routing reflects the fundamental tradeoff identified in the literature: Tor provides lower latency but is vulnerable to end-to-end traffic correlation by a global passive adversary, while Loopix-style Poisson mixing provides stronger resistance to such attacks at the cost of seconds of additional delay.

For the messaging layer, Albrecht et al. [27] identified practically-exploitable cryptographic vulnerabilities in the Matrix end-to-end encryption protocols (Olm and Megolm), demonstrating that a malicious homeserver can read, inject, and modify messages in encrypted rooms. The vulnerabilities — spanning insecure-by-design choices, protocol confusion attacks, and lack of domain separation — invalidated the confidentiality and authentication guarantees claimed by Matrix. This analysis directly informs EACP's decision to adopt MLS (RFC 9420) rather than Olm/Megolm for session encryption, and underscores the importance of formal security proofs rather than ad hoc protocol design.

### Zero-Knowledge Proof Systems

EACP's selective disclosure and verifiable computation capabilities require zero-knowledge proof systems. Groth [28] established the gold standard for proof size with Groth16, achieving pairing-based zk-SNARKs of just three group elements (approximately 192 bytes), with verification requiring only three pairings. This compactness is attractive for EACP's transparency logs, where credential proofs must be embedded without bloating entries. However, Groth16's per-circuit trusted setup — where a compromise enables proof forgery — conflicts with EACP's transparency-first philosophy. The PLONK construction by Gabizon, Williamson, and Ciobotaru (ePrint 2019/953) partially addresses this with a universal, updatable structured reference string, enabling new credential schemas without new ceremonies. For post-quantum future-proofing, zk-STARKs by Ben-Sasson et al. (CRYPTO 2019) eliminate the trusted setup entirely, relying only on collision-resistant hash functions, but at the cost of 100 to 1,000x larger proofs. EACP's choice among these systems — or a layered approach using different proof systems for different operations — remains an open design decision that trades off proof size, setup trust, post-quantum security, and prover efficiency.

The TEE-based privacy paradigm adopted by EACP's competitors further contextualizes our approach. Cheng et al. introduced Ekiden (EuroS&P 2019), which separates consensus from compute execution by running smart contracts inside Intel SGX enclaves while using a blockchain for state persistence. The Oasis Network, including its Sapphire confidential EVM (on which the competing Plurality Network is built), descends directly from Ekiden. Similarly, Zyskind, Nathan, and Pentland proposed Enigma (arXiv 2015), a decentralized computation platform using verifiable secret sharing, which evolved into Secret Network's TEE-based private smart contracts. Both systems achieve runtime privacy through hardware trust assumptions that EACP explicitly avoids. EACP's architectural differentiation — combining public transparency logs for auditability with cryptographic selective disclosure for privacy — avoids both the known TEE side-channel vulnerabilities catalogued above and the opaque trust model inherent in hardware-based privacy, offering what we term "verifiable privacy" as opposed to "opaque privacy."

---

## 4. Proposed Architecture: The 6-Layer Protocol Stack

EACP is organized as a six-layer stack, numbered L0 (lowest, transport) through L5 (highest, token economics). Every interaction between two agents traverses this stack top-down as the initiator and bottom-up as the responder. No layer may be bypassed. The following sections describe the complete stack architecture, then each layer in detail.

### 4.1 Full Stack Overview

```
+=========================================================================+
|                     EACP Protocol Stack                                 |
|                                                                         |
|  Every interaction between two agents traverses this stack top-down     |
|  (initiator) and bottom-up (responder). No layer may be bypassed.       |
+=========================================================================+

  +---------------------------------------------------------------------+
  |  Layer 5: TOKEN LAYER                                               |
  |  Match receipts, reputation tokens, venue stakes                    |
  |  Pedersen commitments, Tessera-anchored ledger                      |
  +---------------------------------------------------------------------+
       |                                                       ^
       | receipt request                          receipt proof |
       v                                                       |
  +---------------------------------------------------------------------+
  |  Layer 4: VERIFIABLE OUTPUT                                         |
  |  BBS+ selective disclosure, ZK match proofs                         |
  |  TEE attestation certs, dual-signed match receipts                  |
  +---------------------------------------------------------------------+
       |                                                       ^
       | compute result                    verified disclosure |
       v                                                       |
  +---------------------------------------------------------------------+
  |  Layer 3: CONFIDENTIAL COMPUTE                                      |
  |  Nitro Enclaves, KMS key release (PCR0+PCR3+PCR8)                   |
  |  vsock I/O, policy-checked outputs, venue isolation                 |
  +---------------------------------------------------------------------+
       |                                                       ^
       | encrypted inputs                     match candidates |
       v                                                       |
  +---------------------------------------------------------------------+
  |  Layer 2: ENCRYPTED DISCOVERY                                       |
  |  Pre-filter (O(1)) -> ANN/HNSW in TEE (O(log n)) -> Re-rank        |
  |  PSI eligibility gates, DH-based on voprf                           |
  +---------------------------------------------------------------------+
       |                                                       ^
       | search query                         discovery result |
       v                                                       |
  +---------------------------------------------------------------------+
  |  Layer 1: IDENTITY & REGISTRY                                       |
  |  DID:eacp:agent:*, Ed25519+ML-DSA-65 identity keys                  |
  |  PQXDH bundles, Tessera transparency log, Agent Cards               |
  |  5-of-9 BFT registry, witness cosigning                             |
  +---------------------------------------------------------------------+
       |                                                       ^
       | identity assertion                 identity verified  |
       v                                                       |
  +---------------------------------------------------------------------+
  |  Layer 0: P2P TRANSPORT                                             |
  |  libp2p mesh, TLS 1.3 (X25519+ML-KEM-768 hybrid)                   |
  |  Optional Nym mixnet, OpenMLS session encryption                    |
  +---------------------------------------------------------------------+
       |                                                       ^
       | encrypted frames                    encrypted frames  |
       v                                                       v
  =====================================================================
                        NETWORK (untrusted)
  =====================================================================
```

### 4.2 Layer Responsibilities

| Layer | Name | Trust Anchor | Primary Libraries |
|-------|------|-------------|-------------------|
| 0 | P2P Transport | TLS 1.3 hybrid PQ certificates | `rust-libp2p`, `aws-lc-rs`, `openmls` |
| 1 | Identity & Registry | Tessera transparency log + BFT quorum | `ed25519-dalek`, `ml-kem`, Tessera (Go) |
| 2 | Encrypted Discovery | TEE attestation (search inside enclave) | `voprf`, HNSW, Nitro SDK |
| 3 | Confidential Compute | Hardware attestation (PCR0+PCR3+PCR8) | Nitro SDK, `aws-lc-rs`, vsock |
| 4 | Verifiable Output | BBS+ signatures + TEE attestation certs | BBS+ (W3C ref impl), `ed25519-dalek` |
| 5 | Token Layer | Pedersen commitments + Tessera anchoring | `curve25519-dalek`, Tessera client |

### 4.3 Layer 0: P2P Transport

Layer 0 provides three-tier encryption: TLS 1.3 (X25519+ML-KEM-768 hybrid, RFC 9758) at the outermost layer, libp2p Noise IX for peer authentication in the middle, and OpenMLS session encryption (X-Wing ciphersuite) at the application layer. The injection firewall sits between application messages and the network stack. Nym mixnet is optional for metadata privacy on sensitive discovery queries, adding 2 to 5 seconds of latency.

```
Agent A                                              Agent B
  |                                                     |
  |  1. Resolve Agent B's DID via DHT/registry          |
  |  2. libp2p dial: TCP + TLS 1.3 (hybrid PQ)         |
  |     ClientHello: key_share=[X25519, ML-KEM-768]     |
  |     <--- ServerHello: key_share=[X25519, ML-KEM-768]|
  |     KDF(X25519_shared || ML-KEM_shared || context)  |
  |  3. Noise IX handshake (libp2p peer auth)           |
  |  4. Fetch Bob's PQXDH prekey bundle from registry   |
  |  5. PQXDH: 4 DH + 1 ML-KEM-768 encapsulation       |
  |     SK = HKDF(DH1||DH2||DH3||DH4||ss_pq)           |
  |  6. OpenMLS group created (X-Wing ciphersuite)      |
  |  7. [Optional] Nym mixnet for sensitive queries     |
```

The hybrid TLS construction is security-conservative by design: the shared secret is derived as `KDF(X25519_shared || ML-KEM_shared || context)`, ensuring that the session key is secure if either the classical or post-quantum component holds. A quantum adversary that breaks X25519 still faces ML-KEM-768; a classical adversary that breaks ML-KEM-768 (if such breaks were found) still faces X25519. This hybrid invariant is mandatory at the protocol level — there is no pure post-quantum fallback, because such a fallback would create a downgrade attack surface.

### 4.4 Layer 1: Identity and Registry

Identity is DID-based: `did:eacp:agent:{blake3(ik_ed25519 || ik_mldsa65)}`. Each agent holds dual-algorithm key pairs: Ed25519 + ML-DSA-65 for signing, X25519 + ML-KEM-768 for key agreement. The DID is self-certifying — it commits to both identity keys in its identifier, preventing key substitution attacks.

The registry runs as a 5-of-9 Byzantine Fault Tolerant consensus cluster using Tendermint. All identity operations — registrations, key rotations, revocations, PQXDH bundle uploads — are logged to Tessera with OmniWitness cosigning (3-of-5 quorum). PQXDH prekey bundles total approximately 7,800 bytes, compared to roughly 100 bytes for classical-only bundles.

**Identity Lifecycle:**
```
  REGISTER --> ACTIVE --> ROTATING --> ACTIVE
                 |                       |
                 +--> ATTESTED ----------+
                 |                       |
                 +--> REVOKING --> REVOKED
```

Revocation uses pre-signed revocation certificates with OCSP stapling (30-minute TTL, 5-minute grace period). Pre-signing ensures revocation is available even if the agent's key is compromised — the revocation certificate was signed before the compromise. The DID is permanently retired on revocation; it cannot be re-activated.

### 4.5 Layer 2: Encrypted Discovery

Discovery runs as a three-phase pipeline, each phase progressively narrowing the candidate set while maintaining privacy:

**Phase 1 — Pre-filter (O(1)):** Fifteen indexed Agent Card fields (domain_categories, capability_tags, geo_scope, supported_protocols, input_modalities, language_codes, compliance_tags, availability_status, min_trust_score, price_range, max_latency_ms, protocol_digests) are queried via inverted indexes. This phase runs in under 5ms and reduces the candidate set from N to approximately N/100.

**Phase 2 — ANN/HNSW inside TEE (O(log n)):** 384-dimensional embeddings (all-MiniLM-L6-v2) derived from agent descriptions are indexed with standard HNSW inside a Nitro Enclave. There is no cryptographic overhead on the search operation itself — the TEE provides the trust boundary. This phase takes 10 to 30ms and returns k=50 candidates.

**Phase 3 — Re-rank and PSI (O(k)):**
```
final_score = semantic_similarity * 0.55
            + trust_score          * 0.25
            + specificity          * 0.15
            + liveness             * 0.05
```

The PSI eligibility gate uses a DH-based PSI protocol built on the `voprf` crate (RFC 9497), running in under 50ms for attribute sets of up to 200 items with approximately 6 KB of communication. This gate enforces hard constraints — dealbreakers, required certifications, geographic exclusions — without exposing either party's full attribute set.

### 4.6 Layer 3: Confidential Compute

Nitro Enclaves serve as venue clean rooms. Each venue operates its own enclave, with matching logic attested to the venue's specific code identity. Data flow through Layer 3:

```
Encrypted input --> [vsock] --> NITRO ENCLAVE TRUST BOUNDARY
                                  |-- NSM attestation (PCR0-8)
                                  |-- KMS.Decrypt(dek, attestation)
                                  |-- Decrypt context packs
                                  |-- Run venue matching logic
                                  |-- Output policy (2-pass):
                                  |   Pass 1: enclave-internal type restriction
                                  |   Pass 2: parent-side schema validation
                                  |-- Sign result (Ed25519)
                                  |-- Attach TEE attestation
                                [vsock] --> Policy-checked output
```

KMS key release conditions bind to three measurements: PCR0 (SHA-384 of the EIF binary — pins to exact enclave code), PCR3 (SHA-384 of the IAM role ARN — pins to authorized operators), and PCR8 (SHA-384 of the signing certificate — pins to the code signer). All three must match for key release. vsock is the only I/O channel: no network stack, no filesystem, no shared memory with the parent instance.

The two-pass output policy is a critical security primitive. Pass 1 runs inside the enclave and enforces type restrictions: only score buckets (5-level), boolean eligibility flags, and Pedersen commitments may be included in outputs. Pass 2 runs on the parent instance and validates the output against a strict JSON Schema. Any deviation causes the entire response to be rejected.

### 4.7 Layer 4: Verifiable Output

**BBS+ Credentials:** The venue enclave signs N fields (match_session_id, agent_a_did, agent_b_did, venue_did, match_score, match_outcome, timestamp, attestation_hash) into a single BBS+ signature over BLS12-381. Agents can subsequently derive unlinkable proofs revealing any subset of fields plus ZK range predicates ("score >= 0.8" without revealing the exact score).

**Match Receipts:** Each match receipt carries four signatures: venue Ed25519, venue ML-DSA-65, protocol Ed25519, and protocol ML-DSA-65. This dual-algorithm dual-party signing ensures the receipt is verifiable even after a partial cryptographic break. Receipts are Merkle-anchored to Tessera and carry the full TEE attestation certificate chain, allowing third parties to verify that the computation ran in an attested enclave with the stated code.

### 4.8 Layer 5: Token Layer

Three token types use Pedersen commitments (C = g^outcome * h^blinding) for privacy-preserving value representation. The homomorphic property of Pedersen commitments enables reputation aggregation without decryption. Bulletproofs range proofs support claims such as "average score >= 0.85" without revealing individual scores or identities. All tokens are Merkle-anchored to Tessera with witness cosigning.

The design choice to avoid on-chain tokens is deliberate. Tokens in EACP are cryptographic attestations, not fungible assets. They do not need global ordering, censorship resistance, or permissionless minting. Tessera provides tamper evidence without consensus overhead — the same architecture as Certificate Transparency (RFC 6962) — at a projected storage cost of approximately $1,700 per year at 2,500+ writes per second, versus $100,000 or more for an equivalent zkRollup deployment.

### 4.9 End-to-End Latency Budget

| Phase | Time |
|-------|------|
| Pre-filter (L2, Phase 1) | ~5ms |
| HNSW search inside TEE (L2, Phase 2) | ~20ms |
| PSI eligibility (L2, Phase 3) | ~50ms |
| Re-ranking (L2, Phase 3) | ~5ms |
| TEE matching + policy check (L3) | ~100ms |
| Match token generation (L4/L5) | ~50ms |
| Tessera anchoring + witness (L5) | ~200ms |
| **Total (without Nym)** | **~430ms** |
| **Total (with Nym mixnet)** | **~2.5–5.5s** |

The 430ms total is competitive with contemporary web application response times and well within tolerance for agent matching interactions. Nym mixnet transport adds 2 to 5 seconds of delay but provides strong metadata privacy guarantees that no timing-correlation attack can overcome without compromising the mix nodes themselves.

---

## 5. The Token Model

EACP's token model uses three distinct token types, each serving a different purpose in the protocol's incentive and accountability structure. This section describes each type in full, including its data structures, cryptographic construction, and economic parameters.

### 5.1 Token Types Overview

| Token | Purpose | Transferable | Generator | Lifetime |
|-------|---------|-------------|-----------|----------|
| **Match Token** | Proof of match outcome | No (bound to participants) | TEE clean room | 90 days default |
| **Reputation Token** | Non-transferable score accumulator | No (soulbound) | Protocol reputation engine | Perpetual with 180-day decay |
| **Venue Stake Token** | Collateral against misbehavior | No (locked to operator) | Venue operator deposit | 90–365 day lock |

**Why not on-chain?** Tokens are cryptographic attestations, not fungible assets. They do not need global ordering, censorship resistance, or permissionless minting. Tessera provides tamper evidence without consensus overhead — the same architecture as Certificate Transparency (RFC 6962). This approach achieves equivalent auditability at 250ms-to-inclusion latency versus 1 to 20 minutes for L1 finality, with no gas fees and at a fraction of the cost.

### 5.2 Match Tokens

Match tokens are the primary accountability primitive of the protocol. They record that two specific agents engaged in a matching operation, the outcome of that operation, and the identity of the venue and enclave that computed it — all without revealing raw profile data.

**Key structural fields:**
- `participants.initiator_commitment` / `responder_commitment`: Pedersen commitments hiding agent identities
- `outcome.outcome_commitment`: Pedersen commitment to match result JSON
- `outcome.score_bucket`: Coarse 5-level bucket (no_match / weak / moderate / strong / exceptional) — exact score hidden
- `outcome.criteria_commitment`: Merkle root of individual criteria Pedersen commitments (enables selective criterion disclosure)
- `attestation`: Full Nitro NSM attestation document binding the token to the attested enclave
- `log_anchor`: Tessera index, Merkle inclusion proof, and witness cosignatures
- `signatures`: Venue Ed25519 + Protocol ML-DSA-65 (dual-signed)

**Pedersen commitment construction:**
```
Generators: g = Ed25519 base point, h = hash-to-curve("EACP-match-receipt-pedersen-v1")
Group order: L = 2^252 + 27742317777372353535851937790883648493

Identity:  C_agent = g * scalar(SHA-256(agent_id)) + h * r
Outcome:   C_outcome = g * scalar(SHA-256(canonical_json(result))) + h * r
Criteria:  C_i = g * scalar(SHA-256(criterion_name_i || result_i)) + h * r_i
           criteria_root = MerkleRoot([C_1, ..., C_n])
```

**4-level verification hierarchy:**
1. **Structural** (requires no secrets): verify signatures, inclusion proof, attestation, timestamps
2. **Participant** (requires own blinding factor): prove "I am a participant in this match"
3. **Outcome** (requires shared blinding factor): prove "this is the authentic result"
4. **Selective criteria** (requires individual Merkle paths): prove individual criterion results without revealing others

### 5.3 Reputation Tokens

Reputation tokens are soulbound — non-transferable and perpetual, but subject to exponential time decay. They aggregate match outcomes into a single reputation score without revealing any individual interaction.

**9-component weighted formula:**
```
overall = (
    transaction_success_rate    * 0.20
  + attestation_density         * 0.10
  + stake_weighted_trust        * 0.10
  + account_age_factor          * 0.05
  + cross_platform_score        * 0.10
  + dispute_health              * 0.15
  + peer_endorsement_score      * 0.15
  + behavioral_consistency      * 0.10
  - specificity_penalty         * 0.05
) * confidence_adjustment
```

**Key formulas:**
- **Decay:** `weight_i = 2^(-age_days / 180)` — interactions have a 180-day half-life, ensuring stale history does not permanently define reputation
- **Account age:** `min(1.0, log2(1 + age_days) / log2(1 + 365))` — reaches 0.5 at approximately 56 days, preventing new accounts from appearing as established actors
- **Confidence adjustment:** `1.0 - (1.0 / (1.0 + 0.1 * interaction_count))` — 10 interactions yields 0.50 confidence, 50 interactions yields 0.83, 100 interactions yields 0.91
- **Specificity penalty:** Compares claimed versus demonstrated capability levels — overclaiming relative to demonstrated performance reduces the overall score

**Agent PageRank for Sybil Resistance:**
- Directed link graph: an edge from agent A to agent B is created if they have a match token with score_bucket of "moderate" or higher
- Standard PageRank algorithm: damping factor d=0.85, convergence threshold delta < 1e-8, recomputed every 24 hours
- Sybil resistance: 100 fake accounts endorsing each other have negligible PageRank because they have no edges from the legitimate network — the link graph is sparse and isolated for attack networks

### 5.4 Venue Stake Tokens

Venue stake tokens represent economic collateral deposited by venue operators against misbehavior. They create skin-in-the-game incentives for venue operators to enforce privacy guarantees, even when cryptographic enforcement alone may be insufficient.

| Tier | Stake (USD) | Lock Period | Max Participants/Epoch | Capabilities |
|------|------------|-------------|----------------------|--------------|
| Discovery | $1,000 | 90 days | 100 | Basic matching, 5 criteria |
| Standard | $10,000 | 180 days | 1,000 | + location, skills, 20 criteria |
| Premium | $50,000 | 270 days | 10,000 | + vector search, PSI, BBS+, 50 criteria |
| Enterprise | $250,000 | 365 days | 100,000 | + custom algorithms, federation, unlimited |

**Slashing conditions:**

| Violation | Severity | Slash | Detection |
|-----------|----------|-------|-----------|
| Data exfiltration | Critical | 100% | TEE vsock monitoring |
| Policy violation | High | 25–75% | Audit + transparency log |
| Data retention violation | High | 25–50% | Post-deletion TEE audit |
| Attestation mismatch | Critical | 50–100% | Continuous PCR0 monitoring |
| Collusion detected | Critical | 100% | Statistical correlation analysis |
| Availability violation | Low | 5%/month | Uptime monitoring |

**Governance:** A 5-member arbitration panel (2 governance representatives, 2 technical auditors, 1 peer venue representative) decides slashing by 3-of-5 majority, with a 30-day decision window and 14-day appeal window.

### 5.5 Privacy-Preserving Transaction Ledger

The transparency ledger records all match outcomes in a form that is publicly auditable without revealing private information.

**On-log versus off-log:**

| On-Log (public) | Off-Log (private) |
|-----------------|-------------------|
| Pedersen commitment of outcome | Actual match scores |
| TEE attestation hash | Agent identities |
| Timestamp, venue ID | Field values, matching criteria |
| Score bucket (coarse), participant count | Blinding factors |
| VRF-indexed agent references | Raw profile data |

**ZK proof of participation** (96 bytes): A Schnorr-style sigma protocol proves knowledge of the blinding factor in a Pedersen commitment without revealing the identity. An agent can prove "I participated in this match" without revealing which agent they are in the commitment.

**Throughput:** 2,500+ writes per second, approximately 17 GB per day of storage, approximately $1,700 per year at S3 pricing. Entries are served as CDN-cacheable immutable tiles using the C2SP tlog-tiles specification.

**Versus zkRollup:** EACP achieves equivalent auditability at 1/100th the complexity and cost. No gas fees, 250ms to inclusion (versus 1 to 20 minutes for L1 finality), $1,700 per year (versus $0.01 to $0.50 per transaction on-chain).

### 5.6 Comparison with Centralized Reputation Systems

| Property | Uber | Airbnb | LinkedIn | App Store | **EACP** |
|----------|------|--------|----------|-----------|----------|
| Verifiable | No | No | No | No | **Yes** — traces to Merkle-anchored match tokens |
| Portable | No | No | Partial | No | **Yes** — works across all EACP venues |
| Privacy | No | No | No | No | **Yes** — Pedersen commitments hide interactions |
| Sybil-resistant | Partial | Partial | No | Partial | **Yes** — PageRank + stake + age factor |
| Gaming-resistant | Poor | Moderate | None | Poor | **Yes** — behavioral outcomes, not self-reported ratings |
| Decay | Lifetime avg | Unclear | None | None | **Yes** — 180-day half-life |
| Algorithmic transparency | None | None | None | Partial | **Full** — formula published, recomputable |

---

## 6. Integration with Existing Technologies

EACP is designed to complement rather than replace the existing agent ecosystem. This section describes the concrete integration paths for each major adjacent technology.

### 6.1 MCP: Venue Endpoints

MCP's three primitives map cleanly onto venue operations:

| MCP Primitive | Venue Operation | Example |
|--------------|----------------|---------|
| **Resources** | Encrypted context packs (read-only, content-addressed) | `eacp-ctx://dating-001/{content-hash}` |
| **Tools** | Brokering operations (register, disclose, match, TEE submit) | `register_context_pack`, `submit_to_clean_room` |
| **Prompts** | Consent workflows (human-in-the-loop approval) | `consent_to_disclosure`, `clean_room_consent` |
| **Elicitation (URL mode)** | Out-of-band authorization (venue auth, TEE verification) | Redirect to venue OAuth or attestation page |
| **Sampling** | Agent-side processing | Generate encrypted profile summary |

**OAuth 2.1 Venue-Scoped Permission Format:**
```
venue:{venue-id}:{resource-type}:{operation}[:{field-list}]

Examples:
  venue:dating-001:profile:read
  venue:dating-001:profile:disclose:age,location
  venue:recruiting-001:resume:disclose:skills,experience
  venue:dating-001:match:compute
```

**MCP Extension Namespace:**
Using MCP's reverse-domain naming convention, EACP defines two extensions:
- `com.eacp/privacy` — selective disclosure, TEE attestation, content addressing, PQ crypto
- `com.eacp/venue` — venue metadata, encrypted search config, retention policies

These are negotiated during the MCP `initialize` handshake via the `experimental` capability field, which is already specified in MCP and designed for exactly this kind of extension.

**Step-Up Authorization Flow:**
```
Agent → Venue: tools/call (submit_to_clean_room)
Venue → Agent: 403 {error: "insufficient_scope", required: "venue:dating-001:match:compute"}
Agent → OAuth: token exchange with elevated scope
Agent → Venue: tools/call (retry with new token)
```

The key insight: MCP provides the transport skeleton. Everything privacy-related — encryption, selective disclosure, TEE attestation — is built as application logic within the venue MCP server. The `com.eacp/privacy` extension declares capabilities; the Venue SDK implements them.

### 6.2 A2A: Agent Discovery Layer

A2A's Agent Card schema maps directly onto EACP's three-phase search pipeline:

| Search Phase | A2A Fields Used | Index Type |
|-------------|----------------|-----------|
| **Phase 1: Pre-Filter (O(1))** | `skills[].tags`, `capabilities`, `supported_interfaces[].protocol`, `provider.organization` | Set intersection, enum match |
| **Phase 2: ANN/HNSW (O(log n))** | `description`, `skills[].description`, `skills[].examples` (embedded) | Vector similarity |
| **Phase 3: Re-Ranking** | `signatures` (trust signal), EACP extensions (reputation, liveness, attestations) | Weighted formula |

**EACP Extension for A2A Agent Cards:**
Using A2A's `extensions` field (type `AgentExtension`):

```json
{
  "name": "EACP Privacy Metadata",
  "uri": "https://eacp.example.com/extensions/privacy/v1",
  "required": false,
  "params": {
    "pqxdh_prekey_bundle": {
      "identity_key": "<Ed25519 pub>",
      "pq_identity_key": "<ML-DSA-65 pub>",
      "signed_prekey": "<X25519 pub>",
      "pq_prekey": "<ML-KEM-768 pub>",
      "one_time_prekeys": ["<X25519 pub>", "..."]
    },
    "venue_memberships": [
      {"venue_id": "dating-001", "joined_at": "2026-03-01", "tier": "verified"}
    ],
    "tee_attestations": [
      {"platform": "nitro", "measurement": "...", "expires_at": "2026-03-16T00:00:00Z"}
    ],
    "reputation": {
      "trust_score": 0.87,
      "txn_success_rate": 0.94,
      "dispute_rate": 0.02,
      "computed_by": "did:eacp:registry:main",
      "computed_at": "2026-03-15T12:00:00Z"
    },
    "liveness": {
      "last_heartbeat": "2026-03-15T11:58:00Z",
      "uptime_30d": 0.997,
      "latency_p95_ms": 340
    }
  }
}
```

**Two-Tier Discovery:**
- **Public card** at `/.well-known/agent.json`: name, description, skills, capabilities (unauthenticated access)
- **Extended card** at the same endpoint with Bearer token: PQXDH prekeys, venue memberships, reputation, attestations

**PQ Card Signing:**
A2A supports JWS signatures. ML-DSA-65 is registerable via IETF draft-ietf-cose-dilithium (`alg: "ML-DSA-65"`, `kty: "AKP"`). For the transition period, EACP uses a hybrid approach: Ed25519 as the primary signature with ML-DSA-65 as a secondary signature. The ML-DSA-65 signature adds approximately 3.3 KB to the Agent Card — acceptable given that Agent Cards are cached and not fetched per-request.

### 6.3 OpenClaw and claude-mem: Bridge to Encrypted Commons

**OpenClaw Bridge — 4-Step Migration:**
1. **Identity Bootstrap:** Generate a new EACP DID (did:jwk) and PQXDH keypair. There is no cryptographic link to the OpenClaw identity, which has no cryptographic identity component.
2. **Skill Audit:** Map OpenClaw skills to EACP capability declarations. Quarantine all skills sourced from ClawHub (which has a documented 20% malicious skill rate). Only migrate skills that pass injection scanning and code review.
3. **Memory Sanitization:** A 7-step pipeline — parse, credential scan, injection scan, PII classification, schema validation, provenance tagging, deterministic hashing — sanitizes memories before migration.
4. **Context Pack Creation:** Sanitized memories are encrypted per-field with venue keys, signed, content-addressed, and logged to the transparency log.

**Security Quarantine Protocol:**
- Q0 (clean): verified first-party, passes all scans
- Q1 (low risk): known source, passes automated scans
- Q2 (medium risk): third-party, requires manual review
- Q3 (quarantined): ClawHub-sourced, 30-day observation period

**Critical rule: No reverse sync.** Once context moves to EACP, it never flows back to OpenClaw. The unencrypted system cannot be trusted as a data sink.

**claude-mem Bridge:**
claude-mem stores memories as Markdown files with YAML frontmatter. The field mapping to EACP context packs:

| claude-mem Field | EACP Context Pack Field | Encryption |
|-----------------|------------------------|-----------|
| `type: user` | `agent_profile.preferences` | Per-venue AES-256-GCM |
| `type: feedback` | `agent_profile.behavioral_constraints` | Per-venue |
| `type: project` | `agent_profile.domain_knowledge` | Per-venue |
| `type: reference` | `agent_profile.external_references` | Public (no encryption) |

Export pipeline: extract from filesystem → classify (SHAREABLE / PRIVATE / SENSITIVE) → transform to EACP schema → sanitize → encrypt → sign → content-address → log.

### 6.4 Mem0: Context Pack Pipeline

Mem0's production-proven extraction pipeline (186M API calls per quarter, Apache-2.0 licensed) serves as EACP's memory extraction layer. The integration wraps Mem0's open-source pipeline with EACP's encryption layer:

```
Mem0 OSS Pipeline               EACP Encryption Layer
┌─────────────────┐            ┌──────────────────────┐
│ Conversation     │            │                      │
│ History          │            │ Schema Validation    │
│      │           │            │      │               │
│      v           │            │      v               │
│ LLM Extraction   │──facts──>  │ Field-Level Encrypt  │
│ (ADD/UPDATE/     │            │ (AES-256-GCM per     │
│  DELETE/NOOP)    │            │  venue key)          │
│      │           │            │      │               │
│      v           │            │      v               │
│ Vector Store     │            │ BBS+ Sign (V2) /     │
│ (Qdrant local)   │            │ Ed25519 Sign (MVP)   │
│                  │            │      │               │
└─────────────────┘            │      v               │
                                │ Content-Address      │
                                │ (CIDv1-SHA256)       │
                                │      │               │
                                │      v               │
                                │ Tessera Log Entry    │
                                └──────────────────────┘
```

**Mem0 Memory Category to EACP Context Pack Field Mapping:**

| Mem0 `categories` | EACP Field | Disclosure Level |
|-------------------|-----------|-----------------|
| `preferences` | `profile.preferences` | Venue-specific |
| `personal` | `profile.demographics` | Selective (BBS+) |
| `professional` | `profile.skills` | Venue-specific |
| `hobbies` | `profile.interests` | Venue-specific |
| `relationships` | `profile.social_graph` | Never auto-disclosed |
| `health` | `profile.sensitive` | TEE-only, never exported |

**Mem0g Graph Memory:**
Neo4j entity triplets map to structured context:
- `(Alice, works_at, Anthropic)` → `profile.employment[].organization`
- `(Alice, skilled_in, Rust)` → `profile.skills[].name`
- `(Alice, located_in, San Francisco)` → `profile.location.city`

**Licensing note:** Mem0 is Apache-2.0 open source. EACP integration uses the open-source pipeline exclusively — no cloud API dependency. The open-source version is functionally equivalent to the cloud offering with self-managed infrastructure.

### 6.5 Web3 Wallets: Agent Identity

**DID Method Recommendation — Three-Layer Hybrid:**

| Layer | DID Method | Purpose | PQ-Ready? |
|-------|-----------|---------|-----------|
| **Genesis** | `did:jwk` | Instant, offline identity creation | Yes — JWK can represent ML-DSA-65 and ML-KEM-768 today |
| **Operational** | `did:webvh` | Key rotation with verifiable history, multi-key DID Documents | Yes — any key type in DID Document |
| **Wallet Linking** | `did:pkh` | Optional Ethereum/Solana wallet association via SIWE/SIWS | N/A — wallet identity, not crypto identity |

**Why `did:jwk` over `did:key` for PQ:**
`did:key` requires multicodec registration — ML-DSA-65 and ML-KEM-768 have no registered codec identifiers yet. `did:jwk` uses JWK encoding, which can represent any key type today via the JOSE ecosystem. IETF draft-ietf-cose-dilithium already defines JWK parameters for ML-DSA.

**Why `did:webvh` for operational identity:**
Formerly `did:tdw` (Trust DID Web), published as v1.0 by the Decentralized Identity Foundation and selected by Switzerland for their national eID system. It provides:
- Hash-chained log of all DID Document versions (verifiable history)
- Pre-rotation support for compromise recovery
- Self-certifying identifier (SCID) — no DNS dependency for verification
- Multi-key DID Documents supporting Ed25519 + ML-DSA-65 + X25519 + ML-KEM-768

**Wallet Integration:**
- **SIWE (EIP-4361):** Wallet signs an authorization certificate binding the wallet identity to EACP keys, using a UCAN + CACAO hybrid format.
- **Phantom (Solana):** Uses native Ed25519 — public keys are directly usable as EACP verification methods with zero translation overhead.
- **MetaMask Snaps:** Can derive Ed25519 keys via SLIP-10 (`snap_getBip32Entropy` with `curve: 'ed25519'`). Cannot currently derive PQ keys — no HD derivation standard exists for lattice cryptography.

**Key insight:** Wallet-based identity is an optional enhancement, not a requirement. EACP's primary identity is `did:jwk` (genesis) evolving to `did:webvh` (operational). Wallets link via signed delegation certificates, not direct key derivation.

---

## 7. Seven Interactive Scenarios

This section presents seven complete interaction scenarios, each illustrating a distinct aspect of the EACP protocol. Every scenario includes a step-by-step cryptographic flow, an ASCII sequence diagram, and an analysis of what an attacker observes.

### Scenario 1: Encrypted Match (Alice and Bob)

**Layers used:** L0–L5 (all six layers)
**Tokens generated:** Match token, MLS session key material, transparency log receipt

Two strangers discover each other through a recruiting venue, exchange ZK proofs of compatibility, and establish a post-quantum encrypted channel — all without either party or the venue learning the other's raw profile data.

**9-phase flow:** Agent Card discovery → pre-filter match → HNSW inside Nitro TEE → PSI eligibility (OPRF_eval, sub-50ms) → TEE scoring (re-rank formula) → two-pass output policy (quantize to 5-bucket tier) → PQXDH handshake (4 DH operations + 1 ML-KEM-768, SK = HKDF of 5 components) → MLS session (X-Wing ciphersuite) → match token with Pedersen commitment → Tessera log entry with witness cosigning.

```
Alice               Registry           Venue R TEE         Bob
  |                    |                    |                 |
  |--Card query------->|                    |                 |
  |<--Cards + sigs-----|                    |                 |
  |  [pre-filter: Bob passes locally]       |                 |
  |--match request(alice_id, bob_id)------->|                 |
  |                    |    KMS.Decrypt(ctxts, attest)        |
  |                    |    [HNSW cosine_sim inside enclave]  |
  |                    |    [PSI: OPRF_eval on constraints]   |
  |                    |    [score: sem*0.55+trust*0.25+...]  |
  |                    |    [output policy: quantize to tier] |
  |<--{tier:"A", psi:true}-----------------|                 |
  |                    |--{tier:"A", psi:true}--------------->|
  |--fetch Bob prekey->|                    |                 |
  |<--IK_B,SPK_B,OPK_B,PQPK_B-------------|                 |
  |  [DH1..DH4 + ML-KEM-768.Encaps]        |                 |
  |  [SK = HKDF(DH1||DH2||DH3||DH4||ss)]   |                 |
  |--{IK_A,EK_A,ct_pq,enc_payload}------------------------->|
  |                    |                    |  [derive SK]     |
  |==MLS Welcome (X-Wing ciphersuite, epoch 0)===============|
  |                    |  [Pedersen: C = g^m * h^r]           |
  |                    |  --match_receipt/v1-->  Tlog          |
  |<--inclusion proof + blinding factor r---|                 |
  |                    |                    |---------------->|
```

**Attacker observes:** Public Agent Card fields. Opaque TEE computation. ML-KEM-768 ciphertext (1,088 bytes). Encrypted MLS frames. Pedersen commitment (32 bytes) in the transparency log. **Cannot:** derive the shared secret, read match scores, link the log entry to either identity.

### Scenario 2: 1:N Venue Broadcast

**Layers used:** L0, L3, L4, L5
**Tokens generated:** K match tokens (one per qualifying candidate), match receipt

Dave submits an encrypted profile to a venue with 1,000 candidates. The TEE runs HNSW top-50, PSI eligibility filtering, weighted scoring, and quantized tier output. Per-result match tokens are Merkle-anchored. Metering uses enclave-internal counters to prevent billing manipulation.

```
Dave              Venue R Parent       Venue R Enclave       KMS         Tlog
  |--verify venue-->|                    |                  |           |
  |--GenDataKey(venue_R_master)----------|----------------->|           |
  |<--{ptxt_dek, ct_blob}---------------|------------------|           |
  |  [AES-GCM.Enc(dek, ctx_pack), zeroize(dek)]           |           |
  |--{ct_blob,nonce,aad,ciphertext}--->|                   |           |
  |                    |--vsock: ct--->|                    |           |
  |                    |               |--Decrypt(attest)->|           |
  |                    |               |<--ptxt_dek--------|           |
  |                    |               |  [HNSW: top 50]   |           |
  |                    |               |  [PSI: filter]    |           |
  |                    |               |  [quantize tier]  |           |
  |                    |<-vsock: res---|                    |           |
  |<--{results, tokens, merkle_proofs}-|                   |           |
  |                    |               |--match_receipt/v1--------->|  |
```

**Attacker observes:** KMS-wrapped ciphertext (opaque). AES-256-GCM ciphertext. Candidate references are salted hashes, unlinkable to real identities. Pedersen commitment and participant count (1,001) in the log. Cannot determine which candidates matched or on what criteria.

### Scenario 3: Secret Sharing (Shamir 2-of-3)

**Layers used:** L0, L2, L3, L4, L5
**Tokens generated:** Share distribution manifest, custody permission entries, standard match tokens

Frank splits a 32-byte Data Encryption Key via Shamir secret sharing over GF(2^8), distributes encrypted shares over MLS channels to 3 storage nodes, and later allows a venue TEE to request 2 shares with NSM attestation, reconstruct via Lagrange interpolation, decrypt the context pack, compute a match, and zeroize all key material.

```
Frank             S1              S2              S3           Venue R TEE
  |  [DEK = rand(32), ct = AES-GCM(DEK, P)]                     |
  |  [Shamir split: DEK -> s1,s2,s3 over GF(2^8)]               |
  |--{enc_s1, ct}->|               |               |             |
  |--{enc_s2, ct}----------------->|               |             |
  |--{enc_s3, ct}--------------------------------->|             |
  |  [sign manifest, log permission/v1 x3, zeroize]              |
  :   (time passes)                                              |
  |                |<--req(attest, frank_id, PCR0)----------------|
  |                |               |<--req(attest, frank_id)-----|
  |                |--{s1, hash1}------------------------------>| |
  |                |               |--{s2, hash2}-------------->| |
  |                |               |               |  [Lagrange   |
  |                |               |               |   interpolate|
  |                |               |               |   decrypt ct |
  |                |               |               |   compute    |
  |                |               |               |   zeroize]   |
```

**Attacker who compromises 1 storage node sees:** One 32-byte share — computationally indistinguishable from uniformly random noise. Cannot reconstruct the DEK. The AES-256-GCM ciphertext is useless without the DEK. Must compromise 2 of 3 nodes to break this scheme.

### Scenario 4: Selective Disclosure (BBS+ Multi-Venue)

**Layers used:** L0, L3, L4
**Tokens generated:** BBS+ credential (held by Carol), proof_R (recruiting venue), proof_D (dating venue)

Carol holds 8 fields in a single BBS+ credential over BLS12-381. She derives two independent, unlinkable proofs:
- **Recruiting venue:** discloses {skills, experience_years, availability} — indices {1,2,3}
- **Dating venue:** discloses {personality_traits, interests, location_city} — indices {4,5,6}

Fresh random blinding is applied per proof. The challenge hash includes the venue_id, binding each proof to its specific venue. A' and A'' are independent randomizations of the original credential randomization element — no algebraic link exists between them.

```
Issuer             Carol              Recruiting Venue      Dating Venue
  |  [BBS+ sign m1..m8]               |                    |
  |--sigma, pk_bbs-->|                 |                    |
  |                  |<--req {1,2,3}---|                    |
  |                  |  [blind A->A', ZK proof, bind venue="recruiting"]
  |                  |--proof_R------->|                    |
  |                  |                 |  [verify: pairing + Schnorr]
  |                  |<--req {4,5,6}----------------------------|
  |                  |  [FRESH blind A->A'', bind venue="dating"]
  |                  |--proof_D----------------------------------->|
  |                  |                 |  [verify: pairing + Schnorr]
  | A' != A'' (independent random blinding -- UNLINKABLE)          |
```

**Colluding venues observe:** proof_R and proof_D with independent A'/A'' values and different challenge hashes. Cannot determine that the proofs came from the same credential. The only remaining attack is statistical analysis of the uniqueness of disclosed field combinations.

### Scenario 5: Venue Isolation (5 Cross-Venue Attacks — All Denied)

**Layers used:** L0, L2, L3, L4, L5
**Tokens generated:** None — all attacks fail at the cryptographic layer

Venue R (malicious) attempts 5 distinct attacks against Venue D's data and participants:

| Attack | Mechanism | Result |
|--------|-----------|--------|
| **Read context packs** | KMS.Decrypt with wrong attestation | `AccessDeniedException` (PCR0_R != PCR0_D) |
| **Use match tokens** | Present Venue D's token as own | Signature verification fails (wrong key) |
| **Replay BBS+ proofs** | Recompute challenge with venue_r | Challenge mismatch (venue_id bound in hash) |
| **Join MLS group** | Try to decrypt Welcome message | Not a group member — decrypt fails |
| **Forge log entry** | Submit fake permission/v1 | Carol's Ed25519 signature required — forgery impossible |

```
Venue R (attacker)        KMS           Tlog
  |  ATTACK 1: Decrypt(venue_d_ct, venue_r_attest)
  |<--AccessDeniedException (PCR0 mismatch)
  |  ATTACK 2: verify(token_D, venue_r_pubkey) -> FAILS
  |  ATTACK 3: recompute challenge with venue_r -> c_R != c' FAILS
  |  ATTACK 4: Welcome encrypted for Carol+partner -> DECRYPT FAILS
  |  ATTACK 5: forge perm/v1(fake carol sig) -> REJECTED
  |  [all 5 attacks DENIED at crypto layer, all logged]
```

The cryptographic separation between venues is not a policy boundary — it is enforced by distinct KMS key hierarchies, distinct PCR0 measurements, distinct MLS group memberships, and distinct BBS+ challenge bindings. No configuration change or insider action can grant one venue access to another venue's data.

### Scenario 6: Permission Revocation with Key Rotation

**Layers used:** L0, L1, L2, L3, L4, L5 (all six)
**Tokens generated:** Revocation log entry, key rotation log entry, OCSP response

Carol revokes Venue R's access. The 8-phase flow: publish pre-signed revocation certificate → OCSP updated (30-minute TTL, 5-minute grace) → generate new X25519 + ML-KEM-768 keys → update KMS policy → re-encrypt context for valid venues → transparency log entries (permission/v1 revoke + key_rotation/v1) → venue's cached data becomes cryptographically dead → in-flight MLS sessions terminated via Remove Proposal.

```
Carol              OCSP             Registry          Venue R TEE      Tlog
  |  [load pre-signed revocation cert]
  |--revoke cert--->|
  |                 |  [VALID->REVOKED, TTL:30min]
  |  [gen new SPK, PQPK, one-time prekeys]
  |--new bundle------------------->|
  |  [re-encrypt ctx_pack for valid venues]
  |--permission/v1(revoke)---------------------------------------------->|
  |--key_rotation/v1(new SPK)----------------------------------------------->|
  :   (within 30 min OCSP TTL)
  |                 |                  |  [epoch boundary: restart]
  |                 |                  |--check perm(carol)-->|
  |                 |                  |<--REVOKED------------|
  |                 |                  |  [refuse decrypt, purge cache]
  |--MLS Remove Proposal (self)------>|  [old_ct is dead]
```

Old ciphertext: the DEK was generated under Venue R's KMS key, but the permission check returns REVOKED. Even with a valid TEE attestation, the application layer rejects the decrypt operation. The data is **cryptographically unrecoverable** — not merely deleted but permanently inaccessible. No legal order, insider threat, or technical exploit can recover it without the key material that has been revoked.

### Scenario 7: Intercept Attempt (Eve — 5 Attack Vectors, Zero Plaintext)

**Layers used:** L0, L1, L2, L3, L5
**Tokens generated:** None by Eve

Eve possesses: full passive network visibility, a future quantum computer, access to all transparency log entries, Alice's compromised long-term identity key (at time T), and traffic analysis capabilities.

| Attack | Eve's Attempt | Result |
|--------|---------------|--------|
| **TLS** | Break X25519 with quantum computer | ML-KEM-768 still holds — hybrid requires BOTH to break |
| **MLS** | Capture N epoch ciphertexts | Each epoch has an independent ML-KEM-768 KEM — N separate lattice problems |
| **Long-term key** | Compromise Alice's ik_a | Forward secrecy: 4 of 5 HKDF inputs are unknown (ephemeral keys zeroized immediately after use) |
| **Traffic analysis** | Correlate timing of Sphinx packets | Nym: uniform 2KB Sphinx packets, Poisson mix delays, indistinguishable cover traffic |
| **Transparency log** | Read all log entries | VRF-indexed identities, Pedersen commitments, SHA-256 hashes — all computationally hiding |

```
Alice              Eve (passive)        Network/Nym          Bob
  |===TLS 1.3 (x25519_ml_kem_768)====|==================|
  |  [Eve breaks X25519, NOT ML-KEM: CANNOT DERIVE SK]   |
  |===MLS epoch 0..N ciphertext=======|==================|
  |  [N epochs = N independent lattice problems]          |
  |  [Eve has ik_a: DH1 known, DH2-4+ss_pq UNKNOWN]     |
  |  [FORWARD SECRECY: past sessions safe]                |
  |--Sphinx pkt (2KB)->| [Nym: 3 hops, random delays,    |
  |                    |  cover traffic] |--Sphinx (2KB)->|
  |  [timing decorrelated: CANNOT LINK]                   |
  |  [Tlog: VRF=opaque, Pedersen=hiding, hashes=one-way] |
  |  ALL 5 ATTACKS: ZERO usable plaintext recovered       |
```

The combination of hybrid post-quantum key exchange, per-epoch forward secrecy, and Nym mixnet metadata protection creates defense in depth at each layer. Eve cannot break the protocol by attacking any single component — she must simultaneously break both the classical and post-quantum components of the hybrid, which no known technique achieves.

### Cross-Scenario Summary

| Scenario | Primary Defense | Attacker Learns |
|----------|----------------|-----------------|
| 1. Encrypted Match | TEE + PQXDH + MLS | Match tier (A–F). Nothing else. |
| 2. 1:N Broadcast | TEE + KMS attestation | Participant count, epoch, Pedersen point. |
| 3. Secret Sharing | Shamir 2-of-3 + TEE | 1 share = 32 bytes of random noise. |
| 4. Selective Disclosure | BBS+ unlinkable proofs | Only disclosed fields. Proofs unlinkable. |
| 5. Venue Isolation | Cryptographic key separation | Nothing. All 5 attacks fail. |
| 6. Revocation | Pre-signed certs + key rotation | Revocation event timing. Old data unrecoverable. |
| 7. Intercept | Hybrid PQ + forward secrecy + mixnet | Ciphertext bytes, decorrelated timing. Zero plaintext. |

---

## 8. Comparison with Existing Protocols

This section provides a comprehensive competitive analysis across 10 dimensions, establishing EACP's strategic position relative to the current ecosystem.

### 8.1 Summary Scores

| Protocol | Score (/50) | Core Thesis | Fatal Flaw |
|----------|-----------|------------|------------|
| **EACP** | 37 | E2E encrypted transactions in TEE clean rooms | Unshipped — risk is execution, not design |
| **A2A** | 31 | Enterprise agent interoperability standard | No E2E encryption, no privacy layer |
| **Plurality** | 24 | User-sovereign context on confidential blockchain | 3 people, $100K, most features "coming soon" |
| **Mem0** | 19 | Universal memory layer for AI apps | No encryption by design — "retrievable" is the feature |
| **OpenClaw** | 11 | Open-source local-first AI agent | No security architecture — 512 vulns, 824+ malicious skills |

### 8.2 Ten-Dimension Comparison

| Dimension | EACP | OpenClaw | Plurality | Mem0 | A2A |
|-----------|------|---------|-----------|------|-----|
| **Privacy Model** | E2E mandatory (PQXDH+MLS), TEE clean rooms, BBS+ selective disclosure, venue isolation | None — 0.0.0.0 bind, plaintext memory, auth tokens in URLs | E2E via Lit Protocol + Oasis Sapphire TEE (SGX) | None — "avoid storing secrets" per own docs | Transport TLS only, no application-layer encryption |
| **Decentralization** | Hybrid — federated venues, Tessera + witnesses, no single point of failure | Centralized per-instance, ClawHub marketplace SPOF | Fully decentralized (Oasis blockchain + Ceramic) | Centralized cloud API; self-hosted option | Federated (DNS+HTTPS discovery), LF governance |
| **Token/Incentives** | No token; reputation via transparency logs; capability-based auth | No token; no reputation system (root cause of malicious skills) | Unclear — Oasis ROSE token for chain fees | No token; usage-based pricing ($19–249/mo) | No token; enterprise licensing model |
| **Agent Discovery** | Three-phase search (pre-filter → ANN → re-rank), anti-gaming (specificity penalties, registry-computed embeddings) | ClawHub marketplace (13K+ skills, 20% malicious) | Smart Profiles (shipped), but no matchmaking | Semantic search over memories (not agents) | Agent Cards at `/.well-known/agent.json`, skill-based |
| **Extensibility** | Venue SDK (7 interfaces), MCP integration, A2A-compatible Agent Cards | 10,700+ ClawHub skills, Node.js SDK | Coming soon — Context SDK, MCP Server not shipped | 24+ vector DB backends, OpenMemory MCP server, Python/JS SDKs | 150+ orgs, AgentExtension mechanism, IBM ACP merger |
| **Security Record** | Unshipped (no track record yet) | **Catastrophic:** CVE-2026-25253 (CVSS 8.8), 135K+ exposed instances, 824+ malicious skills, 1.5M leaked tokens, 36% prompt injection rate | No public audits; depends on SGX (20+ published attacks) | No CVEs; academic MINJA attack achieves 95% injection success | No CVEs; MAESTRO threat model identifies spoofing/replay gaps |
| **PQ Readiness** | **Day-one:** ML-KEM-768 + ML-DSA-65, hybrid key exchange, X-Wing ciphersuite | None | None | None | None |
| **Injection Resilience** | 5-layer protocol firewall: schema enforcement, pattern scan, type-restricted quarantine, lethal trifecta check, audit | 17% native defense rate (academic study); no framework-level protection | Unknown — no documentation | LLM-dependent extraction; MINJA shows 95% injection success on memory-augmented agents | No framework-level defense; MAESTRO identifies injection as gap |
| **Identity Model** | DIDs (did:jwk genesis → did:webvh operational), Ed25519 + ML-DSA-65, optional wallet linking | None — localhost trust assumption, no cryptographic identity | Wallet-based DIDs + VCs on Oasis | API keys tied to organizations | Domain-bound Agent Cards, OAuth 2.0/OIDC, optional JWS signing |
| **Production Readiness** | Pre-launch | 250K+ stars, 300K+ users, but "not appropriate for enterprise" (Microsoft) | $100K funding, ~3 people, most features "coming soon" | **186M API calls/quarter**, $24M raised, 80K+ developers, AWS exclusive partner | **150+ orgs**, Linux Foundation, real deployments (Adobe, S&P Global, Tyson Foods) |

### 8.3 Strategic Positioning

EACP is not competing with any of these protocols — it is the missing layer that completes the ecosystem:

```
Discovery Layer:    A2A Agent Cards (150+ orgs, enterprise standard)
                         ↓
Extraction Layer:   Mem0 Pipeline (186M API calls, production-proven)
                         ↓
Transaction Layer:  EACP (encrypted matching in TEE clean rooms)  ← NOBODY ELSE BUILDS THIS
                         ↓
Transport Layer:    MCP (5,800+ servers, growing ecosystem)
```

The strategic play is to extend A2A for discovery, wrap Mem0 for extraction, and build the encrypted transaction layer on top. This positions EACP as infrastructure that the rest of the ecosystem routes through — not as a competitor to A2A or Mem0, but as the privacy layer they cannot build without breaking their core "retrievable by design" value proposition.

### 8.4 OWASP LLM Top 10 Risk Matrix

| # | OWASP Risk | EACP Mitigation Rating | Residual Risk | Primary Defenses |
|---|-----------|----------------------|---------------|------------------|
| LLM01 | Prompt Injection | **MITIGATED BY DESIGN** | Low | Injection firewall (typed schemas, pattern stripping, quarantine) + capability tokens + venue isolation |
| LLM02 | Sensitive Info Disclosure | **MITIGATED BY DESIGN** | Low | E2E encryption (PQXDH + MLS) + BBS+ selective disclosure + venue isolation + TEE clean rooms |
| LLM03 | Supply Chain Vulnerabilities | **PARTIALLY MITIGATED** | Medium | Agent Cards (identity provenance) + transparency logs + capability containment. Gap: no model integrity verification |
| LLM04 | Data & Model Poisoning | **PARTIALLY MITIGATED** | Medium | Venue isolation (contains blast radius) + CID storage (detects tampering). Gap: cannot evaluate semantic quality |
| LLM05 | Improper Output Handling | **MITIGATED BY DESIGN** | Low | Typed schemas force structured messages + MCP tool schema validation prevents injection-via-output |
| LLM06 | Excessive Agency | **MITIGATED BY DESIGN** | Low | Capability-based auth — unforgeable tokens per-venue-per-action make unauthorized actions cryptographically impossible |
| LLM07 | System Prompt Leakage | **MITIGATED BY DESIGN** | Very Low | System prompts never leave TEE unencrypted + E2E encryption + selective disclosure for config proofs |
| LLM08 | Vector & Embedding Weaknesses | **PARTIALLY MITIGATED** | Medium | Venue isolation prevents multi-tenant leakage + encrypted storage blocks inversion. Gap: intra-venue poisoning |
| LLM09 | Misinformation | **NEEDS NEW DEFENSE** | Medium-High | Protocol secures integrity but not epistemic quality. V2: confidence scoring, cross-agent verification |
| LLM10 | Unbounded Consumption | **PARTIALLY MITIGATED** | Low-Medium | Capability tokens can encode quotas. Gap: must be mandatory, not optional |

---

## 9. Implementation Roadmap

The EACP implementation roadmap spans 18 weeks across three phases, progressing from a minimum viable protocol targeting the talent recruitment use case through full encrypted search capabilities and complete privacy tier support. Each phase builds on the previous, with no phase requiring technology that has not been validated by the research teams.

### 9.1 MVP: Secure Talent Pool (Weeks 1–8)

The MVP delivers a working encrypted agent matching protocol for a single domain (talent recruiting), establishing all core cryptographic primitives and the venue isolation model. The WeKruit recruiting platform serves as the first venue, allowing end-to-end validation with a production use case where the protocol team controls both sides.

**Backend Deliverables:**

| Week | Deliverable |
|------|------------|
| 1–2 | Validate `aws-lc-rs` v1.16.1 ML-KEM-768 (stable) and ML-DSA-65 (unstable, non-FIPS). Benchmark: key generation, encapsulation/decapsulation, signing. Establish FIPS monitoring cadence for CMVP #pending status. |
| 2–4 | Implement PQXDH from the public domain specification using `ml-kem` 0.2.3 + `x25519-dalek` v2 + `ed25519-dalek` v2. Property-based tests against Signal's published PQXDH test vectors. |
| 3–6 | Integrate OpenMLS v0.7.2 (Apache-2.0/MIT) for session management. Implement device-as-group-member model. Define store trait implementations for IdentityKeyStore, PreKeyStore, KyberPreKeyStore, SessionStore. |
| 4–8 | Build DH-based PSI on `voprf` v0.6.0 (RFC 9497). Benchmark with realistic attribute sets of 50–200 items. Target: sub-50ms LAN latency, sub-6 KB communication. |

**Frontend Deliverables:**

| Week | Deliverable |
|------|------------|
| 1–2 | Publish Agent Card JSON Schema. A2A-compatible base fields with EACP extensions (attestations, reputation, liveness, privacy tier). Validate against A2A specification. |
| 2–4 | MCP context broker server (TypeScript, `@modelcontextprotocol/server`). Streamable HTTP transport. `experimental.privacy` capability namespace. Six core tools: register_context_pack, request_disclosure, submit_to_clean_room, discover_matches, grant_venue_permission, verify_disclosure_proof. |
| 3–6 | Venue SDK interfaces 1–3: VenueRegistration, EncryptedSearch, EncryptedMatch. TypeScript implementation with Zod schema validation. Integration with WeKruit recruiting platform. |
| 6–8 | End-to-end WeKruit integration: Mem0 extraction → encrypted context pack → registry → TEE match → selective disclosure result. |

**Infrastructure Deliverables:**

| Week | Deliverable |
|------|------------|
| 1–2 | AWS Nitro Enclave hello-world with KMS key release and attestation verification. Validate PCR0+PCR3+PCR8 policy enforcement. Confirm Evervault architecture pattern works end-to-end. |
| 2–4 | Injection firewall Layers 1, 3, and 5 (schema enforcement, type-restricted quarantine, audit). JSON Schema Draft 2020-12 with `additionalProperties: false`. All free-form text fields rejected or quarantined. |
| 3–6 | Tessera personality in Go. Four entry types: permission/v1, key_rotation/v1, venue_registration/v1, match_receipt/v1. POSIX backend (zero external dependencies). Register with OmniWitness network. |
| 6–8 | HNSW inside Nitro Enclave for vector search. Attestation-verified enclave launch. Policy-checked output via vsock. Benchmark: target under 30ms for datasets up to 1M vectors. |

**Latency targets for MVP:** Pre-filter under 5ms, HNSW search under 20ms, PSI under 50ms, TEE match under 100ms, token generation under 50ms. Total under 430ms excluding Tessera anchoring (200ms additional, asynchronous).

### 9.2 V2: Encrypted Search v1 (Months 3–4)

Phase 2 extends the MVP with production-scale encrypted search, the full 5-layer injection firewall, BBS+ selective disclosure, and multi-cloud TEE support.

**Deliverables:**

- **Encrypted Search:** Federated vector search with enclave-enforced policy per venue. Support for up to 10M vectors per venue. Integrate the three-phase search pipeline (pre-filter → HNSW → PSI re-rank) as a single orchestrated operation.
- **PSI/APSI Eligibility Gates:** PSI eligibility becomes a standard pipeline stage for all match operations, not opt-in. Evaluate Microsoft APSI C++ FFI feasibility; implement application-layer authorization if APSI wrapping is too complex.
- **Transparency Log Live:** Switch from POSIX to AWS S3 + DynamoDB backend. Register with OmniWitness network and require 3-of-5 witness cosignatures on all log entries. Publish Rust client library for agents.
- **Full Injection Firewall:** Add Layer 2 (probabilistic content classifier using PromptGuard 2 pattern) and Layer 4 (lethal trifecta enforcement, data abstraction firewall, HITL gate). All 5 layers operational.
- **BBS+ Selective Disclosure V1:** Integrate W3C VC Data Integrity BBS Cryptosuites v1.0 reference implementation. Issue BBS+ credentials for match outcomes. Support proof generation and verification at L4.
- **Multi-Cloud TEE Abstraction:** Thin attestation abstraction layer normalizing Nitro/SEV-SNP/TDX attestation into a common "venue attestation token" format. SEV-SNP support for Azure deployments. All PCR/measurement binding maintained per platform.

**Performance targets for V2:** Match operation under 500ms end-to-end for datasets up to 10M. BBS+ proof generation under 100ms. Transparency log inclusion under 1 second. 99.9% uptime for registry operations.

### 9.3 V3: Privacy Tiers, AEO, and ZK Proofs (Months 5–6)

Phase 3 delivers the full privacy tier system, adversarially-robust agent ranking, and zero-knowledge proof integration.

**Deliverables:**

- **Privacy Tiers:** Three distinct privacy tiers for venue operations — TEE tier (MVP, operational), PSI tier (eligibility gates without TEE, for latency-sensitive operations), and Cryptographic tier (full PIR for registry queries, Compass ORAM evaluation for vector search). Each tier documents its trust assumptions explicitly.
- **Agent Engine Optimization (AEO):** Anti-gaming mechanisms for agent discovery rankings. Specificity penalty enforcement (log-scale dampening for 50+ skill claims). Registry-computed embeddings (agent cannot supply adversarial embedding vectors). Behavioral reputation gates. Liveness proof requirements.
- **VRF-Indexed Key Transparency:** Implement IETF keytrans pattern for efficient "current key for agent X" lookups without revealing the full agent directory. VRF-indexed log-backed map. Integration with CONIKS-style privacy-preserving directory.
- **ZK Proof Integration:** Evaluate Groth16 versus PLONK versus zk-STARKs for EACP's credential proof use cases. Deploy ZK participation proofs (96-byte Schnorr-style) for transparency log entries. Bulletproofs for range predicates in reputation claims ("average score >= 0.85" without revealing individual scores).
- **Cross-Agent Verification:** Confidence scoring and source citation in typed message schemas. Cross-agent verification protocol for high-stakes factual claims. Fact-checking agent role definition for regulated venues (financial, medical).
- **Compass ORAM Evaluation:** Port Compass ORAM approach to Rust. Benchmark against TEE-based vector search. Decision: adopt for venues requiring fully untrusted server threat model, maintain TEE path for performance-sensitive venues.

---

## 10. References

### 10.1 Private Information Retrieval and Private Set Intersection

**[1]** Mingxun Zhou, Andrew Park, Elaine Shi, and Wenting Zheng. "Piano: Extremely Simple, Single-Server PIR with Sublinear Server Computation." In *2024 IEEE Symposium on Security and Privacy (S&P)*, pp. 4296–4314. IEEE, 2024. DOI: 10.1109/SP54263.2024.00055. ePrint: https://eprint.iacr.org/2023/452

**[2]** Alexandra Henzinger, Matthew M. Hong, Henry Corrigan-Gibbs, Sarah Meiklejohn, and Vinod Vaikuntanathan. "One Server for the Price of Two: Simple and Fast Single-Server Private Information Retrieval." In *Proceedings of the 32nd USENIX Security Symposium*, pp. 3889–3905. USENIX, 2023. ePrint: https://eprint.iacr.org/2022/949

**[3]** Alexander Burton, Samir Jordan Menon, and David J. Wu. "Respire: High-Rate PIR for Databases with Small Records." In *Proceedings of the 2024 ACM SIGSAC Conference on Computer and Communications Security (CCS '24)*. ACM, 2024. DOI: 10.1145/3658644.3690328. ePrint: https://eprint.iacr.org/2024/1165

**[4]** Vladimir Kolesnikov, Ranjit Kumaresan, Mike Rosulek, and Ni Trieu. "Efficient Batched Oblivious PRF with Applications to Private Set Intersection." In *Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16)*, pp. 818–829. ACM, 2016. DOI: 10.1145/2976749.2978381. ePrint: https://eprint.iacr.org/2016/799

**[5]** Hao Chen, Zhicong Huang, Kim Laine, and Peter Rindal. "Labeled PSI from Fully Homomorphic Encryption with Malicious Security." In *Proceedings of the 2018 ACM SIGSAC Conference on Computer and Communications Security (CCS '18)*, pp. 1223–1237. ACM, 2018. DOI: 10.1145/3243734.3243836. ePrint: https://eprint.iacr.org/2018/787

### 10.2 Confidential Computing and TEE Security

**[6]** Ruiyi Zhang, Lukas Gerlach, Daniel Weber, Lorenz Hetterich, Youheng Lu, Andreas Kogler, and Michael Schwarz. "CacheWarp: Software-based Fault Injection using Selective State Reset." In *Proceedings of the 33rd USENIX Security Symposium*, pp. 1135–1151. USENIX, 2024. CVE-2023-20592.

**[7]** Benedict Schluter, Christoph Wech, and Shweta Shinde. "Heracles: Chosen Plaintext Attack on AMD SEV-SNP." In *Proceedings of the 2025 ACM SIGSAC Conference on Computer and Communications Security (CCS '25)*. ACM, 2025. DOI: 10.1145/3719027.3765209

**[8]** Fabian Rauscher, Luca Wilke, Hannes Weissteiner, Thomas Eisenbarth, and Daniel Gruss. "TDXploit: Novel Techniques for Single-Stepping and Cache Attacks on Intel TDX." In *Proceedings of the 34th USENIX Security Symposium*. USENIX, 2025. Distinguished Paper Honorable Mention.

**[9]** Masanori Misono, Dimitrios Stavrakakis, Nuno Santos, and Pramod Bhatotia. "Confidential VMs Explained: An Empirical Analysis of AMD SEV-SNP and Intel TDX." In *Proceedings of the ACM on Measurement and Analysis of Computing Systems (POMACS)*, Vol. 8, No. 3. Presented at ACM SIGMETRICS '25. DOI: 10.1145/3700418

**[10]** Jalen Chuang, Alex Seto, Nicolas Berrios, Stephan van Schaik, Christina Garman, and Daniel Genkin. "TEE.fail: Breaking Trusted Execution Environments via DDR5 Memory Bus Interposition." To appear in *IEEE Symposium on Security and Privacy (S&P '26)*. https://tee.fail/

### 10.3 Encrypted Search and Private Approximate Nearest Neighbors

**[11]** Jinhao Zhu, Liana Patel, Matei Zaharia, and Raluca Ada Popa. "Compass: Encrypted Semantic Search with High Accuracy." In *19th USENIX Symposium on Operating Systems Design and Implementation (OSDI '25)*, pp. 915–938. USENIX, 2025. ePrint: https://eprint.iacr.org/2024/1255

**[12]** Mingxun Zhou, Elaine Shi, and Giulia Fanti. "Pacmann: Efficient Private Approximate Nearest Neighbor Search." In *Proceedings of the International Conference on Learning Representations (ICLR 2025)*. ePrint: https://eprint.iacr.org/2024/1600

**[13]** Hilal Asi, Fabian Boemer, Nicholas Genise, Muhammad Haris Mughees, Tabitha Ogilvie, Rehan Rishi, Kunal Talwar, Karl Tarbe, Akshay Wadia, Ruiyu Zhu, and Marco Zuliani. "Scalable Private Search with Wally." In *ACM SIGIR 2024 (Industry Track)*. arXiv: 2406.06761

**[14]** Alexandra Henzinger, Emma Dauterman, Henry Corrigan-Gibbs, and Nickolai Zeldovich. "Private Web Search with Tiptoe." In *29th ACM Symposium on Operating Systems Principles (SOSP 2023)*. ACM, 2023. DOI: 10.1145/3600006.3613134. ePrint: https://eprint.iacr.org/2023/1438

**[15]** Jingyu Li, Zhicong Huang, Min Zhang, Jian Liu, Cheng Hong, Tao Wei, and Wenguang Chen. "Panther: Private Approximate Nearest Neighbor Search in the Single Server Setting." In *Proceedings of the 2025 ACM SIGSAC Conference on Computer and Communications Security (CCS '25)*. ACM, 2025. DOI: 10.1145/3719027.3765190. ePrint: https://eprint.iacr.org/2024/1774

### 10.4 Post-Quantum Cryptography and Secure Messaging

**[16]** Karthikeyan Bhargavan, Charlie Jacomme, Franziskus Kiefer, and Rolfe Schmidt. "Formal Verification of the PQXDH Post-Quantum Key Agreement Protocol for End-to-End Secure Messaging." In *Proceedings of the 33rd USENIX Security Symposium*. USENIX, 2024.

**[17]** Joel Alwen, Sandro Coretti, Yevgeniy Dodis, and Yiannis Tselekounis. "Security Analysis and Improvements for the IETF MLS Standard for Group Messaging." In *Advances in Cryptology — CRYPTO 2020*, LNCS vol. 12170, pp. 248–277. Springer, 2020. DOI: 10.1007/978-3-030-56784-2_9. ePrint: https://eprint.iacr.org/2019/1189

**[18]** Manuel Barbosa, Deirdre Connolly, Joao Diogo Duarte, Aaron Kaiser, Peter Schwabe, Karolin Varner, and Bas Westerbaan. "X-Wing: The Hybrid KEM You've Been Looking For." *IACR Communications in Cryptology*, vol. 1, no. 1, April 2024. ePrint: https://eprint.iacr.org/2024/039

**[19]** Yevgeniy Dodis, Daniel Jost, Shuichi Katsumata, Thomas Prest, and Rolfe Schmidt. "Triple Ratchet: A Bandwidth Efficient Hybrid-Secure Signal Protocol." In *Advances in Cryptology — EUROCRYPT 2025*, LNCS, pp. 302–331. Springer, 2025. DOI: 10.1007/978-3-031-91101-9_11. ePrint: https://eprint.iacr.org/2025/078

### 10.5 Verifiable Credentials and Key Transparency

**[20]** Stefano Tessaro and Chenzhi Zhu. "Revisiting BBS Signatures." In *Advances in Cryptology — EUROCRYPT 2023*, LNCS vol. 14008, pp. 691–721. Springer, 2023. DOI: 10.1007/978-3-031-30589-4_24. ePrint: https://eprint.iacr.org/2023/275

**[21]** Marcela S. Melara, Aaron Blankstein, Joseph Bonneau, Edward W. Felten, and Michael J. Freedman. "CONIKS: Bringing Key Transparency to End Users." In *Proceedings of the 24th USENIX Security Symposium*, pp. 383–398. USENIX, 2015. ePrint: https://eprint.iacr.org/2014/1004

### 10.6 Agent Security and Prompt Injection

**[22]** Manuel Costa, Boris Kopf, Aashish Kolluri, Andrew Paverd, Mark Russinovich, Ahmed Salem, Shruti Tople, Lukas Wutschitz, and Santiago Zanella-Beguelin. "Securing AI Agents with Information-Flow Control." arXiv:2505.23643, 2025.

**[23]** Edoardo Debenedetti, Ilia Shumailov, Tianqi Fan, Jamie Hayes, Nicholas Carlini, Daniel Fabian, Christoph Kern, Chongyang Shi, Andreas Terzis, and Florian Tramer. "Defeating Prompt Injections by Design." arXiv:2503.18813, 2025.

**[24]** Kai Greshake, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz, and Mario Fritz. "Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection." In *Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security (AISec '23)*. ACM, 2023. DOI: 10.1145/3605764.3623985. arXiv: 2302.12173

**[25]** Sahar Abdelnabi, Amr Gomaa, Eugene Bagdasarian, Per Ola Kristensson, Reza Shokri. "Firewalls to Secure Dynamic LLM Agentic Networks." arXiv:2502.01822, 2025.

### 10.7 Privacy-Preserving Networking

**[26]** Ania M. Piotrowska, Jamie Hayes, Tariq Elahi, Sebastian Meiser, and George Danezis. "The Loopix Anonymity System." In *Proceedings of the 26th USENIX Security Symposium*. USENIX, 2017. arXiv: 1703.00536

**[27]** Martin R. Albrecht, Sofia Celi, Benjamin Dowling, and Daniel Jones. "Practically-exploitable Cryptographic Vulnerabilities in Matrix." In *Proceedings of the 44th IEEE Symposium on Security and Privacy (S&P 2023)*. IEEE, 2023. DOI: 10.1109/SP46215.2023.10351027. ePrint: https://eprint.iacr.org/2023/485

### 10.8 Zero-Knowledge Proof Systems

**[28]** Jens Groth. "On the Size of Pairing-Based Non-interactive Arguments." In *Advances in Cryptology — EUROCRYPT 2016*, LNCS vol. 9666, pp. 305–326. Springer, 2016. DOI: 10.1007/978-3-662-49896-5_11. ePrint: https://eprint.iacr.org/2016/260

### 10.9 Standards and Specifications

**[S1]** NIST FIPS 203. "Module-Lattice-Based Key-Encapsulation Mechanism Standard." National Institute of Standards and Technology, August 2024.

**[S2]** NIST FIPS 204. "Module-Lattice-Based Digital Signature Standard." National Institute of Standards and Technology, August 2024.

**[S3]** IETF RFC 9420. "The Messaging Layer Security (MLS) Protocol." Internet Engineering Task Force, 2023.

**[S4]** IETF RFC 6962. "Certificate Transparency." Internet Engineering Task Force, 2013.

**[S5]** IETF draft-irtf-cfrg-bbs-signatures. "The BBS Signature Scheme." IRTF Crypto Forum Research Group, active draft.

**[S6]** IETF draft-ietf-keytrans-protocol. "Key Transparency Protocol." IETF Key Transparency Working Group, active draft.

**[S7]** IETF RFC 9758. "X25519MLKEM768." Internet Engineering Task Force, 2025.

**[S8]** IETF RFC 9497. "Oblivious Pseudorandom Functions (OPRFs) Using Prime-Order Groups." Internet Engineering Task Force, 2023.

**[S9]** IETF draft-ietf-cose-dilithium. "ML-DSA for JOSE and COSE." COSE Working Group, active draft.

### 10.10 Integration and Competitive Sources

**MCP and A2A Integration:**
- MCP Specification (2025-11-25): https://spec.modelcontextprotocol.io/
- A2A Protocol Specification: https://a2a-protocol.org/latest/specification/
- A2A Agent Discovery: https://a2a-protocol.org/latest/topics/agent-discovery/
- A2A Linux Foundation Launch: https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project

**TEE Platforms:**
- AWS Nitro Enclaves Attestation: https://docs.aws.amazon.com/enclaves/latest/user/set-up-attestation.html
- Evervault Enclaves (3-year production reference): https://evervault.com/products/enclaves
- Confidential VMs: SEV-SNP vs TDX (SIGMETRICS 2025): https://dl.acm.org/doi/10.1145/3700418

**Transparency Logs:**
- Trillian Tessera: https://github.com/transparency-dev/trillian-tessera
- C2SP tlog-tiles Specification: https://github.com/C2SP/C2SP/blob/main/tlog-tiles.md
- C2SP tlog-witness Specification: https://github.com/C2SP/C2SP/blob/main/tlog-witness.md

**Mem0 and Competitors:**
- Mem0 Documentation: https://docs.mem0.ai/
- Mem0 arXiv Paper (2504.19413): https://arxiv.org/abs/2504.19413
- Plurality Network: https://docs.plurality.network/
- MAESTRO Threat Model for A2A (CSA): https://cloudsecurityalliance.org/blog/2025/04/30/threat-modeling-google-s-a2a-protocol-with-the-maestro-framework

**OpenClaw Security Research:**
- CVE-2026-25253 (CVSS 8.8): https://www.oasis.security/blog/openclaw-vulnerability
- ToxicSkills Study: https://snyk.io/blog/openclaw-toxicskills-report/
- Exposed Instances (135K+): https://www.bitsight.com/blog/openclaw-ai-security-risks-exposed-instances

**Injection and Prompt Security:**
- Simon Willison, "The Lethal Trifecta": https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- The Attacker Moves Second: https://arxiv.org/abs/2510.09023
- Meta Agents Rule of Two: https://ai.meta.com/blog/practical-ai-agent-security/
- MCP Tool Poisoning (Invariant Labs): https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
- Backdoored postmark-mcp: https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft

**Rust Cryptography:**
- aws-lc-rs on crates.io: https://crates.io/crates/aws-lc-rs
- voprf crate: https://crates.io/crates/voprf
- OpenMLS: https://github.com/openmls/openmls
- Project Eleven — State of PQC in Rust: https://blog.projecteleven.com/posts/the-state-of-post-quantum-cryptography-in-rust-the-belt-is-vacant

**Identity:**
- DID:webvh (DIF): https://identity.foundation/did-webvh/
- W3C Verifiable Credentials: https://www.w3.org/TR/vc-data-model-2.0/
- W3C DIDs: https://www.w3.org/TR/did-core/
- W3C VC Data Integrity BBS Cryptosuites: https://www.w3.org/TR/vc-di-bbs/

---

*End of Document*

*This whitepaper represents the current state of EACP design as of 2026-03-15. It is a pre-publication draft synthesizing research from six team reports across backend cryptography, frontend product design, and infrastructure security. The protocol specification documents referenced throughout (spec-eacp-protocol-stack.md, spec-eacp-token-model.md, spec-eacp-interactive-scenarios.md) contain the complete wire-format specifications and are the authoritative source for implementation details.*
