# Architecture Debate Synthesis

*Three-way adversarial debate between Pragmatist, Security Purist, and Product Visionary*
*Optimization bias: Ship something real in 6 weeks*

---

## Verdict Summary

| Question | Pragmatist | Security Purist | Product Visionary | **VERDICT** |
|----------|-----------|----------------|-------------------|-------------|
| **Q1: age E2E encryption** | DEFER | DEFER | DEFER | **UNANIMOUS: DEFER** |
| **Q2: BBS+ vs Ed25519** | KEEP BBS+ | KEEP BBS+ | KEEP BBS+ | **UNANIMOUS: KEEP BBS+** |
| **Q3: Process isolation** | KILL | KEEP (with enforcement) | Keep concept, simplify impl | **COMPROMISE** |
| **Q4: Claude Code + ChatGPT** | Claude only | Both | Both | **MAJORITY: BOTH** |

---

## Q1: age E2E Encryption — DEFER (Unanimous)

All three debaters agree, but for different reasons:

| Debater | Reason |
|---------|--------|
| **Pragmatist** | No A2A agents have `keyAgreement` yet. TLS is industry standard. Saves 5-8 days. |
| **Security Purist** | Bare age has NO sender authentication (Critical gap). Half-baked E2E creates false security. Ship sign-then-encrypt properly in Phase 2 or don't ship it. |
| **Product Visionary** | E2E is invisible plumbing. User experience is identical with or without it. Spend time on visible features instead. |

### Decision

- **Remove age E2E encryption from MVP scope**
- **Remove "Three-Pillar Defense Model"** — rename to "Two-Pillar Defense" (Context Minimization + Structured Data Only). Do not claim security properties that don't exist.
- **Keep `keyAgreement` in Agent Card schema** as OPTIONAL field for forward compatibility
- **Phase 2**: Implement sign-then-encrypt (JWS inner + age outer), matching DIDComm authcrypt pattern

### Savings: 5-8 days

---

## Q2: BBS+ Selective Disclosure — KEEP (Unanimous)

The strongest consensus across all three positions. Every debater agrees this is non-negotiable:

| Debater | Key Argument |
|---------|-------------|
| **Pragmatist** | "Without selective disclosure, we're building `curl` with a signature." Ed25519-first means rewriting the credential pipeline — double the work. |
| **Security Purist** | Without BBS+, every share leaks more data than authorized, violating the product's core privacy promise. Ed25519 VPs reveal entire credential categories. |
| **Product Visionary** | The "magic moment" is seeing that Ditto got 3 attributes out of 30 — cryptographically excluded, not just "not sent." THIS is the product. |

### Decision

- **BBS+ from day one** — non-negotiable
- **Timebox to 5 days** — if Digital Bazaar stack doesn't work in 5 days, tactical retreat to per-attribute Ed25519 VCs (documented as temporary)
- **Scope ruthlessly** (Pragmatist's cuts):
  - Fixed credential schema (no custom fields in MVP)
  - 3 hardcoded disclosure presets (`minimal`, `professional`, `full`) — no per-field picking
  - Consider simplified canonicalization if JSON-LD proves too fragile
- **Pin library versions to exact commits**, run W3C BBS test vectors in CI
- **Week 1, Days 1-5**: BBS+ proof-of-concept before writing any other code. If this fails, reassess everything.

### Risk mitigation: Ed25519 per-attribute fallback designed (not built) as insurance

---

## Q3: Context-Scoped Isolation — COMPROMISE

This was the most contested question. The final decision balances all three positions:

| Debater | Position |
|---------|----------|
| **Pragmatist** | Kill process isolation entirely. Function-level scoping with good code hygiene is sufficient. Saves 3-4 days. |
| **Security Purist** | Keep it, but with Node.js 22 `--experimental-permission` enforcement. Rewrite all false "CANNOT" claims. No bare `child_process.fork()`. |
| **Product Visionary** | Keep the architecture (it's a great security story), implement as in-process data scoping. Defer OS-level isolation. |

### Decision: Keep the data flow architecture. Implement as in-process scoping for MVP. Honest documentation.

Concretely:
1. **Keep the Orchestrator/Scoped architecture** — the orchestrator function never calls `readProfile()`, only `readCredentials(approvedList)`. Each share gets a fresh context with only approved attributes.
2. **MVP implementation: in-process function scoping** — not `child_process.fork()`. The `share` command loads ONLY the approved credential files, generates VP, sends, exits. No separate OS process needed.
3. **Remove all "CANNOT" claims** from architecture docs. Replace with: *"The sharing pipeline is designed to load only approved attributes. This is enforced by code architecture (the share module has no import path to the full profile), not by OS-level process isolation. Runtime enforcement via Node.js permission model is planned for Phase 2."*
4. **Phase 2**: Add `child_process.fork()` + `--experimental-permission` when bidirectional agent communication introduces untrusted input processing.
5. **No LLM in the sharing pipeline** — the scoped context is pure computation (VP generation, encryption, A2A send). No LLM reasoning that could be prompt-injected.

### Savings: 3-4 days (no process lifecycle management, IPC, error handling for child processes)

---

## Q4: Claude Code + ChatGPT — BOTH (Majority 2-1)

| Debater | Position | Key Argument |
|---------|----------|-------------|
| **Pragmatist** | Claude only | Save 7-10 days. Focus on one excellent experience. |
| **Security Purist** | Both | Different risk profiles, both manageable. Add cycle detection for ChatGPT DAG. |
| **Product Visionary** | Both | 2-3 day investment that transforms product from "Claude plugin" to "universal AI identity." |

The Pragmatist's 7-10 day estimate was challenged. The Product Visionary argued ChatGPT is actually the EASIER parser (single JSON file, well-documented structure) vs Claude Code (scattered JSONL files, undocumented format, DAG reconstruction). Realistic ChatGPT effort: **2-3 days** after Claude Code parser is built.

### Decision: Ship both, but Claude Code first

1. **Week 2-3**: Build Claude Code parser (4-5 days, the harder parser)
2. **Week 3-4**: Build ChatGPT parser (2-3 days, leveraging shared `ConversationParser` interface)
3. **ChatGPT-specific requirements** (from Security Purist):
   - Validate top-level JSON structure before full parse
   - Streaming parser for files > 500MB (enforce 512MB memory cap)
   - DAG cycle detection (visited-set tracking)
   - Depth limits and string length limits on JSON parsing
4. The demo showing "2,050 conversations across 2 sources" is worth the 2-3 extra days

### Cost: 2-3 additional days (not the 7-10 the Pragmatist estimated)

---

## Revised Timeline

| Original Estimate | After Debate Cuts |
|-------------------|-------------------|
| 51-69 days | **31-42 days** |

| Cut | Days Saved |
|-----|-----------|
| Defer age E2E encryption | 5-8 |
| Scope BBS+ ruthlessly (fixed schema, presets) | 3-4 |
| In-process scoping instead of child_process isolation | 3-4 |
| Simplify consent manager (JSON, not YAML, no constraints) | 3 |
| Skip interactive TUI review (use $EDITOR) | 3 |
| Skip rate limiting in MVP | 1 |
| Skip audit log rotation/filtering | 2 |
| **Total saved** | **20-25 days** |

| Added | Days Cost |
|-------|-----------|
| ChatGPT parser (majority decision) | +2-3 |
| Mock agent for testing/demo | +3 |
| BBS+ proof-of-concept (Week 1 gate) | included in BBS+ budget |
| **Total added** | **5-6 days** |

**Net: ~15-19 days saved. Revised estimate: 32-44 days. Achievable in 6 weeks with focused execution.**

---

## Critical Action Items (Before Writing Code)

### Week 1 Gate: BBS+ Proof-of-Concept (Days 1-5)

Before any other code is written, prove the crypto works:
1. Generate BLS12-381 key pair
2. Sign a VC with `bbs-2023` cryptosuite using a custom JSON-LD context
3. Produce a derived proof with selective disclosure (reveal 3 of 10 claims)
4. Verify the derived proof

**If this takes > 5 days**: Emergency reassessment. Consider per-attribute Ed25519 VCs as tactical retreat.

### Documentation Fixes (Day 1)

1. Remove "Three-Pillar Defense Model" — rename to "Two-Pillar Defense"
2. Remove all "CANNOT" claims about scoped instances
3. Resolve Agent Card path (`/.well-known/agent.json` everywhere)
4. Resolve "Guardian Agent" terminology → Orchestrator + sharing pipeline
5. Resolve credential category count (standardize on 4 or 6)
6. Resolve BBS+ library recommendation (Digital Bazaar primary, across all docs)
7. Resolve filesystem layout inconsistencies

### Non-Negotiable Security Requirements (from Security Purist)

1. BBS+ selective disclosure in MVP
2. Mandatory user review of extracted attributes
3. No false security claims in documentation
4. Pre-processing redaction before LLM extraction
5. ChatGPT parser: cycle detection, depth limits, streaming parser
6. Self-issued credentials labeled "self-attested" everywhere (never "verified")
7. `profile.json` encrypted at rest (not plaintext)

---

## Points of Continued Disagreement

These were not fully resolved and should be revisited in Phase 2 planning:

1. **Pragmatist wants hardcoded disclosure presets** (3 presets, no per-field selection). Security Purist wants per-field selection (more granular = more privacy). Product Visionary doesn't care as long as the demo shows selective disclosure. **For MVP**: Ship presets. Add per-field in v0.2.

2. **JSON-LD canonicalization** — Pragmatist wants to skip it entirely (custom canonical form). Security Purist insists on spec compliance. **For MVP**: Use standard JSON-LD if it works within the 5-day BBS+ timebox. If it doesn't, Pragmatist's custom form is acceptable as a documented deviation.

3. **Mock agent deployment** — Pragmatist wants it in the repo. Product Visionary wants 2-3 hosted demo agents. **For MVP**: One mock agent in the repo that doubles as test fixture and demo. Hosted agents are a nice-to-have.
