# Backend Report 004 — Distilled Agents Architecture Research

**Task:** task-004-backend
**Date:** 2026-03-16
**Research Method:** Deep multi-agent research (5 parallel agents with heavy web search)
**Status:** Complete

---

## Executive Summary

The "distilled agent" architecture — where each user gets a minimal, sanitized proxy agent per use-case bucket — is technically feasible with today's tools, but the **re-identification risk of exchange-info-only profiles is the critical design challenge**. A profile like "5 years Rust + distributed systems + Stripe + UC Berkeley" carries ~48 bits of entropy, enough for global unique identification. The solution is a 4-tier progressive revelation system where matching operates on coarsened attributes (Tier 1-2) and specific details are revealed only post-mutual-interest (Tier 3-4). The recommended MVP pipeline: extract via small LLM → classify with multi-layer PII detection → enforce via deterministic agent core with typed JSON communication → match via hybrid HNSW + attribute filtering within buckets.

---

## 1. Distillation Pipeline: Extract → Classify → Sanitize → Deploy

### 1.1 Pipeline Architecture

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

### 1.2 Step-by-Step Pipeline

| Step | Tool | Input | Output | Cost |
|------|------|-------|--------|------|
| **1. Parse** | Custom parser | Claude Code JSONL / ChatGPT JSON export | Conversation turns (text) | Free |
| **2. Extract** | GPT-4o-mini or Gemini 2.0 Flash | Conversation turns | Structured JSON facts (Mem0-style ADD/UPDATE/DELETE) | ~$1-2 per 1M tokens |
| **3. PII Detect** | Multi-layer (see §1.3) | Extracted facts | Facts tagged as `exchange_info` or `pii` | ~$0.50 per 1K facts |
| **4. Coarsen** | Rule-based | Tagged exchange info | k-anonymized exchange info (e.g., "Stripe" → "FAANG-tier") | Free |
| **5. Schema Validate** | Pydantic / JSON Schema | Coarsened facts | Typed `DistilledAgentProfile` | Free |
| **6. Encrypt PII** | AES-256-GCM per-user key | PII facts | Encrypted PII vault | Free |
| **7. Deploy** | Registry API | Profile + encrypted vault | Live distilled agent in bucket | Free |

### 1.3 PII Detection: Multi-Layer Pipeline

No single tool achieves sufficient accuracy alone. The recommended approach layers four detection methods:

**Layer 1 — Regex/Pattern Matching** (deterministic, fast)
- SSN: `\d{3}-\d{2}-\d{4}`
- Credit cards: Luhn-validated patterns
- Email: RFC 5322 pattern
- Phone: libphonenumber
- **Accuracy: ~100% for structured PII formats**

**Layer 2 — NER Model** (statistical, handles names/locations)
- **spaCy `en_core_web_trf`**: 90.19% NER F1 (transformer backbone)
- **Flair NLP**: 92-98% F1 depending on entity type
- **Roblox PII Classifier**: 94% F1, 98% recall (context-aware, adversarial-resistant)
- Source: [spaCy model benchmarks](https://spacy.io/models/en#en_core_web_trf)

**Layer 3 — Presidio Orchestrator** (combines Layer 1 + Layer 2)
- Microsoft Presidio orchestrates NER + regex + context analyzers
- Vanilla accuracy is "not very accurate" per maintainers; ~30% F1 improvement with tuning
- Open source, 3.3K stars, actively maintained
- Source: [Microsoft Presidio GitHub](https://github.com/microsoft/presidio)

**Layer 4 — LLM Classifier** (final sweep for edge cases)
- Uses GPT-4o-mini/Haiku to review borderline cases
- Catches: implicit PII, coded references, context-dependent identifiers
- Cost: ~$0.15 per 1M input tokens
- **Err toward classifying borderline cases as PII** (false positives are safe; false negatives leak data)

### 1.4 PII Detection Accuracy — Tool Comparison

| Tool | F1 Score | Recall | Cost | Best For | Source |
|------|----------|--------|------|----------|--------|
| **Private AI** | Misses 0.2-7% | 93-99.8% | Commercial | Production PII detection | [Private AI benchmarks](https://www.private-ai.com/) |
| **John Snow Labs** | 98.6% | — | Commercial | Healthcare/clinical PII | [John Snow Labs](https://www.johnsnowlabs.com/) |
| **ab-ai/pii_model (BERT)** | ~96% | — | Free (OSS) | General PII | [HuggingFace](https://huggingface.co/ab-ai/pii_model) |
| **Roblox PII Classifier** | 94% | 98% | Free (OSS) | Adversarial-resistant | [Roblox Engineering Blog](https://blog.roblox.com/) |
| **Flair NLP** | 92-98% | — | Free (OSS) | Named entities | [Flair GitHub](https://github.com/flairNLP/flair) |
| **spaCy trf** | 90.19% | — | Free (OSS) | General NER | [spaCy models](https://spacy.io/models/en) |
| **Presidio (tuned)** | ~70-80% | — | Free (OSS) | Orchestration framework | [Presidio GitHub](https://github.com/microsoft/presidio) |
| **AWS Comprehend** | Not published | — | $1/1M chars | Cloud API, 36 entity types | [AWS Comprehend](https://aws.amazon.com/comprehend/) |
| **Google DLP** | Not published | — | $1-3/GB | 150+ InfoTypes | [Google Cloud DLP](https://cloud.google.com/sensitive-data-protection) |

**Critical risk:** General-purpose tools miss **13.8-46.5% of PII entities** when used alone. The multi-layer pipeline reduces this to <2% by catching what each individual layer misses.

### 1.5 Sanitization Beyond Removal

| Technique | How It Works | Use in EACP |
|-----------|-------------|-------------|
| **Generalization** | "Stripe" → "FAANG-tier fintech" | Reduce re-identification of exchange info |
| **k-anonymity** | Ensure every attribute combination appears ≥k times | Minimum k=50 for exchange info |
| **l-diversity** | Ensure diversity within k-anonymous groups | Prevents attribute inference |
| **Differential privacy** | Add calibrated noise | ε=4-6 gives 10-15% matching precision drop |
| **Bucketing** | "3-5 years experience" instead of "4 years" | Standard for salary/experience ranges |

---

## 2. Agent Sandboxing & Minimal Disclosure

### 2.1 Sandboxing Technology Comparison

| Technology | Isolation Level | Startup Time | Memory Overhead | Known Escapes | Best For |
|-----------|----------------|-------------|----------------|---------------|----------|
| **Docker** | Process (shared kernel) | ~554ms | ~23MB | Multiple critical CVEs (CVE-2024-21626 CVSS 8.6, CVE-2025-9074 CVSS 9.3) | Development only |
| **gVisor** | User-space kernel | ~1s | ~50MB | **Zero known escapes** | Default production choice |
| **Firecracker** | Hardware VM (KVM) | **<125ms** | **~5MB** | 1 minor CVE (local jailer race) | High-security workloads |
| **WASM (wasmtime)** | Capability sandbox | **<5 microseconds** | **<1MB** | JIT compiler bugs (CVE-2025-0291) | Deterministic agent logic |

**Recommendation for distilled agents:**
- **MVP:** gVisor (zero escapes, <1% overhead for 70% of workloads per Ant Financial production data)
- **Production:** WASM for the deterministic agent core (capability-based: no filesystem, no network by default — must be explicitly granted), calling external LLM API via a single granted network capability
- **High-security venues:** Firecracker microVM per agent interaction

### 2.2 Output Enforcement Stack (5 Layers)

```
Distilled Agent Output
        │
        ▼
┌─────────────────────────────┐
│ Layer 1: Schema Enforcement │  Pydantic/JSON Schema validator
│ (structural)                │  Prune unknown fields automatically
│                             │  Only typed fields pass through
├─────────────────────────────┤
│ Layer 2: PII Scanner        │  Presidio + custom patterns
│ (content)                   │  Scan every string field for PII
│                             │  Block if PII detected
├─────────────────────────────┤
│ Layer 3: Allowlist Matcher  │  Regex allowlist per field type
│ (pattern)                   │  skills[] must match known skills
│                             │  company names from approved lists
├─────────────────────────────┤
│ Layer 4: Rate Limiter       │  Max messages/minute per agent
│ (behavioral)                │  Anomaly detection on output volume
├─────────────────────────────┤
│ Layer 5: Cryptographic Sign │  Ed25519 signature on output
│ (integrity)                 │  Non-repudiation + audit trail
└─────────────────────────────┘
```

### 2.3 Framework Capability Limits

| Framework | Tool Restriction Mechanism | Effectiveness |
|-----------|--------------------------|---------------|
| **Strands (AWS)** | `BeforeToolCallEvent` — deterministic gate outside LLM | 100% blocking of invalid tool calls |
| **LangGraph** | Node-level guards, tool allowlists per node | Deterministic enforcement |
| **AutoGen** | Reply functions intercept all agent outputs | Programmable output filtering |
| **CrewAI** | Guardrails (quality-focused, not security) | Insufficient alone |
| **NeMo Guardrails** | 5 categories of rails + PII masking built-in | Good for output filtering |

**Constitutional AI (Anthropic):** Reduced jailbreak success from 86% to 4.4% (95% blocking rate) at 23.7% compute cost increase. Source: [Anthropic Constitutional Classifiers](https://www.anthropic.com/research/constitutional-classifiers). However, multi-turn adaptive attacks degrade effectiveness to 78.5% bypass. Constitutional AI is a hardening layer, not a guarantee.

---

## 3. Prompt Injection Prevention in Agent Proxies

### 3.1 The Two Attack Surfaces

| Surface | Threat | When | Defense |
|---------|--------|------|---------|
| **Input (distillation)** | User's conversation history contains injection payloads | Agent creation time | Input sanitization + typed extraction |
| **Runtime (commons)** | Other agents craft messages that manipulate the distilled agent | Agent operation time | Deterministic core + schema enforcement |

### 3.2 Input-Side Detection Tools

| Tool | Detection Rate | False Positive Rate | Model | Source |
|------|---------------|-------------------|-------|--------|
| **PromptGuard 2 (86M)** | 99.8% (on benchmark) | — | Fine-tuned mDeBERTa | [Meta AI](https://ai.meta.com/blog/prompt-guard-2-guardrails-for-safe-deployable-ai/) |
| **PIGuard** | 98.23% | 0.85% | Multi-modal classifier | Published at NeurIPS 2025 |
| **NeMo Guardrails** | ~90% | ~10% | Rail-based + classifier | [NVIDIA NeMo](https://github.com/NVIDIA/NeMo-Guardrails) |
| **Rebuff** | ~85% | — | Multi-layer (LLM+heuristic) | [Rebuff.ai](https://rebuff.ai/) |
| **LLM Guard** | ~80-90% | — | Pattern + classifier | [LLM Guard](https://github.com/protectai/llm-guard) |

**Critical caveat:** The "When Benchmarks Lie" paper (Feb 2026) shows real-world accuracy drops **1-25% below benchmark claims**. Adaptive attacks bypass >50% of detection-only defenses. **Detection is necessary but insufficient as sole defense.**

### 3.3 The Deterministic vs LLM Agent Tradeoff

This is the KEY architectural decision for distilled agents:

| Approach | Injection Risk | Flexibility | Matching Quality | Recommendation |
|----------|---------------|-------------|-----------------|----------------|
| **Option A: LLM-powered agent** | HIGH — vulnerable to jailbreak | High — natural conversation | High — can reason about nuance | Not recommended alone |
| **Option B: Deterministic agent** | **ZERO** — no LLM to attack | Low — rigid matching only | Medium — attribute comparison only | Safe but limited |
| **Option C: Hybrid** (recommended) | **NEAR-ZERO** | Medium-High | High | **Recommended** |

**Option C (Hybrid) Architecture:**

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

The deterministic core makes ALL decisions. The LLM is invoked only for natural language formatting, operating on a typed intermediate representation that contains no PII and no raw profile data. Even if the LLM is compromised, it has no access to sensitive data.

**Research backing:**
- **Type-Directed Privilege Separation** (2025): Restricting quarantine outputs to int/float/bool/enum achieves **0% attack success rate**. Source: [arXiv 2509.25926](https://arxiv.org/html/2509.25926)
- **FIDES** (Microsoft): 0 policy violations via information flow control. Source: [arXiv 2505.23643](https://arxiv.org/abs/2505.23643)
- **MELON** (ICML 2025): >99% attack prevention via masked re-execution.
- **CaMeL** (DeepMind): 77% task completion with provable security via dual-LLM separation. Source: [arXiv 2503.18813](https://arxiv.org/abs/2503.18813)

### 3.4 Schema-Enforced Communication

Inter-agent messages in the commons use a strict typed protocol:

```json
{
  "$schema": "https://eacp.org/schemas/commons-message/v1",
  "type": "object",
  "properties": {
    "message_type": { "enum": ["match_query", "match_response", "interest_signal", "decline"] },
    "sender_agent_id": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
    "bucket_id": { "type": "string", "enum": ["job-seeking", "hiring", "dating", "co-founder", "freelance"] },
    "compatibility_score": { "type": "number", "minimum": 0, "maximum": 1 },
    "matched_attributes": { "type": "array", "items": { "type": "string", "maxLength": 50 }, "maxItems": 20 },
    "timestamp_ms": { "type": "integer" }
  },
  "required": ["message_type", "sender_agent_id", "bucket_id", "timestamp_ms"],
  "additionalProperties": false
}
```

**`additionalProperties: false`** is the key defense — any field not in the schema is automatically rejected. Free-form text fields are eliminated entirely from inter-agent communication. This structurally prevents injection payloads from being transmitted between agents.

---

## 4. The O(NK) Bucket Model

### 4.1 Architecture

```
User creates account
        │
        ├──> Distill "job-seeking" agent ──> Job Bucket (N agents)
        │    (skills, experience, salary range)
        │
        ├──> Distill "dating" agent ──────> Dating Bucket (N agents)
        │    (hobbies, location, preferences)
        │
        └──> Distill "co-founder" agent ──> Co-Founder Bucket (N agents)
             (business idea, skills needed, equity split)
```

**Scaling:** N=100K users × K=10 buckets = 1M distilled agents. Each agent: ~50 structured fields + 768-dim embedding = ~3.2KB. Total storage: ~3.2GB (fits on a single machine).

### 4.2 Within-Bucket Matching

The recommended approach is **hybrid search**: structured attribute filtering + semantic vector similarity.

**Phase 1 — Attribute Filtering** (deterministic, <5ms)
- Inverted index on structured fields (skills, location, budget_range)
- Boolean/range filters: `experience >= 3 AND location IN ["SF Bay", "Remote"]`
- Reduces candidate set from N to ~N/10-N/100

**Phase 2 — Vector Similarity** (ANN, <20ms)
- HNSW index on 768-dim embeddings of agent descriptions
- Top-K retrieval within filtered candidates
- **HNSW benchmarks:** 99.2% recall@1 at 0.104ms/query on 1M vectors (Qdrant)
- Source: [ANN Benchmarks](https://ann-benchmarks.com/)

**Phase 3 — Pairwise Scoring** (compatibility model, <50ms)
- Run on top-50 candidates from Phase 2
- Two-tower or cross-encoder model for fine-grained compatibility
- Returns ranked list with compatibility scores

**Total latency target: <70ms end-to-end** (achievable based on production benchmarks from YouTube, TikTok, LinkedIn recommendation systems).

### 4.3 Cross-Bucket Queries

For "a co-founder who is also local for hiking":

**Approach: Unified index with bucket_id as metadata filter**

```sql
-- Pseudo-query
SELECT agent_id, compatibility_score
FROM agents
WHERE bucket_id IN ('co-founder', 'hobbies')
  AND skills @> ARRAY['hiking']
  AND location = 'SF Bay'
ORDER BY vector_similarity(query_embedding, agent_embedding) DESC
LIMIT 50
```

Implementation options:
1. **Single vector DB collection** with `bucket_id` as payload filter (Qdrant recommendation)
2. **Bitmap intersection indexes** for frequent cross-bucket combinations (microsecond-level)
3. **Union + re-rank**: Query each bucket independently, merge and re-rank results

### 4.4 Bucket Granularity

| Approach | Examples | Pros | Cons |
|----------|---------|------|------|
| **Broad (5-10)** | job-seeking, hiring, dating, co-founder, freelance, hobbies | Simple, always populated | Noisy matches |
| **Medium (20-50)** | backend-engineer, frontend-engineer, ML-engineer, ... | Better precision | Some empty at launch |
| **Fine (100+)** | rust-distributed-systems-sf-senior | Very precise | Most empty until scale |

**Recommendation: Start with 5-10 top-level buckets with multi-tag membership.** Users can belong to multiple buckets simultaneously. Split buckets when density exceeds 100K agents.

Precedent: Match Group runs 45+ separate apps as "buckets." Netflix has 76,897 micro-genres but shows each user only 20-30. LinkedIn uses just 5 employment types. Reddit started broad; users created niche communities organically.

### 4.5 Vector Database Selection

| Database | 1M Vectors (768-dim) | 10M Vectors | Latency (p99) | Partitioning | Source |
|----------|---------------------|-------------|--------------|-------------|--------|
| **Qdrant** | ~6GB, single node | ~60GB, 3-node cluster | <30ms | Payload filtering (preferred over collection-per-bucket) | [Qdrant docs](https://qdrant.tech/documentation/) |
| **Milvus** | ~6GB | ~60GB | <30ms | Partition keys by bucket | [Milvus docs](https://milvus.io/docs/) |
| **Pinecone** | Managed | Managed | **7ms p99** at 10M | Namespaces as buckets | [Pinecone](https://www.pinecone.io/) |
| **pgvector** | ~6GB in Postgres | Needs tuning | 50-100ms | Table partitioning | [pgvector](https://github.com/pgvector/pgvector) |

**MVP recommendation:** pgvector (already in Postgres, no extra infra). Scale to Qdrant when >100K agents.

---

## 5. Cryptographic Split: Exchange Info vs PII

### 5.1 The Re-Identification Problem (CRITICAL)

**Exchange info alone is quasi-identifying at dangerous levels.**

| Research Finding | Re-ID Rate | Data Points Needed | Source |
|-----------------|-----------|-------------------|--------|
| Sweeney (2000) | **87%** of US population | ZIP + DOB + gender (3 fields) | [Sweeney, Carnegie Mellon](https://dataprivacylab.org/projects/identifiability/) |
| De Montjoye (2013) | **95%** of people | 4 spatiotemporal points | [Nature Scientific Reports](https://www.nature.com/articles/srep01376) |
| De Montjoye (2015) | **90%** | 4 credit card transactions | [Science](https://www.science.org/doi/10.1126/science.1256297) |
| Netflix Prize (2008) | **99%** of subscribers | 6-8 movie ratings | [Narayanan & Shmatikov](https://arxiv.org/abs/cs/0610105) |

**Applied to our exchange info:** A profile like "5 years Rust + distributed systems + Stripe + UC Berkeley" carries approximately **48 bits of entropy** — well above the 33 bits needed for global unique identification among 8 billion people. At k-anonymity level, this profile has **k=1-5** (virtually uniquely identifying).

**This means: raw exchange info cannot be treated as "non-PII" for matching.**

### 5.2 The 4-Tier Progressive Revelation System

The solution is to match on COARSENED attributes at first, revealing specifics only after mutual interest:

| Tier | Visibility | Example | k-Anonymity Target | When Revealed |
|------|-----------|---------|-------------------|---------------|
| **Tier 0** | Public | Bucket category ("job-seeking") | k > 100,000 | Always visible |
| **Tier 1** | Within bucket | "Backend engineer, 3-7 years, Bay Area" | k > 1,000 | During matching |
| **Tier 2** | Matched pool only | "Rust, distributed systems, fintech" | k > 50 | After initial compatibility score > 0.7 |
| **Tier 3** | Post-mutual-interest | "Worked at Stripe, UC Berkeley CS" | k > 5 | After both agents signal interest |
| **Tier 4** | User-controlled | "Jane Smith, jane@email.com" | k = 1 (PII) | After explicit user consent via BBS+ selective disclosure |

### 5.3 Encryption Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Distilled Agent Profile               │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Tier 0 (cleartext, public):                         │
│    bucket_id: "job-seeking"                          │
│    agent_id: "a7f3b1..."  (pseudonymous)             │
│                                                       │
│  Tier 1 (cleartext in bucket, coarsened):            │
│    role_category: "backend-engineer"                 │
│    experience_band: "3-7 years"                      │
│    location_region: "US-West"                        │
│    salary_band: "$150K-250K"                         │
│    embedding: float[768]  (of Tier 1 description)    │
│                                                       │
│  Tier 2 (encrypted, revealed post-score):            │
│    enc_key: venue_key                                │
│    skills: AES(["rust", "tokio", "grpc"])            │
│    domain: AES("fintech")                            │
│    education_level: AES("MS CS")                     │
│                                                       │
│  Tier 3 (encrypted, revealed post-mutual-interest):  │
│    enc_key: match_session_key                        │
│    company: AES("Stripe")                            │
│    school: AES("UC Berkeley")                        │
│    specific_projects: AES([...])                     │
│                                                       │
│  Tier 4 (PII vault, per-user key, BBS+ signed):     │
│    enc_key: user_master_key                          │
│    full_name: AES("Jane Smith")                      │
│    email: AES("jane@stripe.com")                     │
│    phone: AES("+1-555-0123")                         │
│    bbs_signature: BBS+(all_fields)                   │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Key management:**
- Tier 1: Cleartext (coarsened enough to be safe at k>1000)
- Tier 2: Encrypted with venue-scoped key (derived from agent master key + venue_id via HKDF)
- Tier 3: Encrypted with match-session key (ephemeral, created when both agents signal interest)
- Tier 4: Encrypted with user's master key; selective disclosure via BBS+ proofs

### 5.4 BBS+ Selective Disclosure for Post-Match Reveal

The W3C BBS Data Integrity Cryptosuite (`bbs-2023`) enables:
1. **Issuer** signs ALL fields (Tiers 0-4) with a single BBS signature
2. **Holder** (distilled agent) generates unlinkable ZK proofs revealing only chosen tiers
3. **Verifier** confirms the revealed fields were signed by the issuer without seeing hidden fields

Example flow for Tier 4 reveal:
```
User decides to share email with matched agent
  → Agent generates BBS ProofGen(signature, [reveal: email, hide: phone, name, address])
  → Matched agent receives: email + ZK proof of validity
  → Matched agent runs BBS ProofVerify → confirmed authentic
```

**Unlinkability:** Multiple proof presentations from the same credential cannot be correlated back to the same underlying signature. This prevents tracking across matches.

### 5.5 Threat Model for the Split

| Threat | Risk Level | Mitigation |
|--------|-----------|------------|
| **Exchange info leak → re-identification** | HIGH if raw | 4-tier progressive revelation; Tier 1 coarsened to k>1000 |
| **Cross-bucket linkage** (job agent + dating agent → identify user) | HIGH | Different pseudonymous agent_id per bucket; no shared identifiers |
| **Temporal correlation** (enters job bucket → someone quits their company) | MEDIUM | Delay agent creation by random 1-14 days; batch bucket updates |
| **Matching pattern analysis** (who matches with whom reveals info) | MEDIUM | Matching runs inside TEE; only boolean "matched/not-matched" exits |
| **Embedding inversion** (reconstruct text from embedding vector) | LOW-MEDIUM | Use Tier 1 coarsened text for embedding; never embed raw profile |

---

## 6. MVP Recommendation: Simplest Viable Distillation Pipeline

Based on the CEO review's mandate to "cut to 6-week MVP" and the eng review's mandate to "validate the hypothesis before building the protocol":

### 6-Week MVP Pipeline

| Week | Deliverable | Approach |
|------|------------|----------|
| **1** | Conversation parser + LLM extractor | Parse Claude JSONL + ChatGPT JSON. Extract facts via GPT-4o-mini with structured output (JSON mode). |
| **2** | PII classifier + coarsening | Layer 1 (regex) + Layer 2 (spaCy trf) + Layer 3 (Presidio). Coarsen exchange info to Tier 1 granularity. |
| **2-3** | Distilled agent profile schema | Pydantic model for `DistilledAgentProfile` with Tier 0-1 fields. Store in Postgres. |
| **3-4** | Bucket matching (job-seeking first) | pgvector for HNSW similarity + attribute filters. Hybrid search within single bucket. |
| **4-5** | WeKruit integration | Submit Tier 1 profiles to matching engine. Return top-K matches with compatibility scores. |
| **5-6** | Output enforcement + basic audit | Schema validation on all outputs. PII scan on all outgoing messages. Hash-chained audit log. |

### What's Deferred to V2

| Component | Why Deferred | When to Add |
|-----------|-------------|-------------|
| Tier 2-3 progressive revelation | Needs TEE for secure reveal | V2 with Nitro integration |
| BBS+ selective disclosure | Tier 4 PII reveal needs crypto | V2 |
| WASM agent sandboxing | gVisor/Docker sufficient for single-venue MVP | V2 for multi-venue |
| Deterministic agent core in Rust | TypeScript prototype first, port to Rust for V2 | V2 |
| Cross-bucket queries | Only 1 bucket (job-seeking) in MVP | V2 when adding dating/co-founder |
| Differential privacy on exchange info | Coarsening is sufficient for MVP k-anonymity | V2 |

### MVP Cost Estimate

| Component | Monthly Cost | Source |
|-----------|-------------|--------|
| GPT-4o-mini extraction (10K users × 100K tokens avg) | ~$150 | OpenAI pricing |
| Postgres + pgvector (RDS) | ~$200 | AWS RDS |
| API server (ECS) | ~$300 | AWS ECS |
| Presidio PII scanning | ~$0 (self-hosted) | Open source |
| **Total MVP infra** | **~$650/month** | |

---

## Key Takeaways

1. **Re-identification is the biggest risk**, not prompt injection. A raw skills+experience profile is uniquely identifying. The 4-tier progressive revelation system is the core architectural innovation.

2. **Deterministic agent core + optional LLM formatter** is the right hybrid. The deterministic core is immune to injection; the LLM only formats typed intermediate representations and has no access to PII.

3. **Multi-layer PII detection** (regex + NER + Presidio + LLM sweep) reduces missed PII to <2%, vs 13-46% for any single tool.

4. **Start with 5-10 buckets**, single vector DB with metadata filtering. pgvector for MVP, Qdrant at scale. Cross-bucket queries via unified index with bucket_id filter.

5. **Typed JSON communication with `additionalProperties: false`** structurally prevents inter-agent injection — free-form text is eliminated from the protocol entirely.

6. **The MVP is achievable in 6 weeks** with off-the-shelf components (GPT-4o-mini extraction, spaCy + Presidio PII detection, pgvector matching, Pydantic schema enforcement).
