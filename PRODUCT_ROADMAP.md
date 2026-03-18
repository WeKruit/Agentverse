# Agentverse Product Roadmap

**Version:** 2.0
**Last Updated:** March 17, 2026
**Status:** Active — M0 through M3 complete

---

## 1. Product Vision

Agentverse is a privacy-preserving system that lets people extract a verifiable professional and personal profile from their AI conversation history and share it -- selectively, cryptographically, and on their own terms -- with other people's AI agents for recruiting, dating, cofounder search, and any high-stakes human matching scenario.

**Who it is for:** Developers, job seekers, founders, and anyone who has invested hundreds of hours talking to AI assistants and wants that accumulated self-portrait to work for them -- without surrendering control of their data.

**What problem it solves:** Today, your richest self-description lives inside ChatGPT and Claude conversations that are trapped, non-portable, and invisible to the outside world. Meanwhile, LinkedIn profiles are public, static, and performative. Recruiting, dating, and cofounder matching all suffer from the same structural problem: to find a match, you must broadcast your identity to strangers before knowing if a match even exists. Agentverse inverts this. Your AI agent shares only what you approve, only with agents you trust, only for purposes you consent to -- and cryptographic selective disclosure means hidden attributes are mathematically inaccessible, not just hidden behind a UI toggle.

---

## 2. Product Milestones

### M0: "Hello World" -- First Working Demo
**Target:** Day 1-2 | **Status: DONE**

**User-facing value:** You run a single command and see your AI-extracted professional profile for the first time. The BBS+ cryptographic foundation is proven and working under the hood.

**Key features:**
- `agentverse init` generates cryptographic keys and sets up `~/.agentverse/`
- `agentverse extract` parses Claude Code JSONL and ChatGPT JSON into a structured profile
- `agentverse profile` displays your extracted skills, interests, values, career context, and communication style with confidence bars
- BBS+ selective disclosure proof-of-concept passes (sign a VC with 10 claims, derive a proof revealing 3, verify it independently)
- Profile encrypted at rest with user passphrase
- PII redaction filter (API keys, passwords, emails, SSNs) runs before extraction

**Success metrics:**
| Metric | Target | Actual |
|--------|--------|--------|
| Time from install to first profile view | < 5 minutes | ~2 minutes |
| BBS+ sign + derive + verify cycle completes | Pass/fail gate | PASSED |
| Tests passing | > 30 | 37 |

---

### M1: "Portable Resume" -- Issue Credentials and Share with an Agent
**Target:** Day 2-3 | **Status: DONE**

**User-facing value:** You can share a selective, cryptographically verifiable presentation of your profile with any agent that publishes a standard Agent Card. You choose exactly which attributes to reveal. The agent can verify the proof but cannot access anything you hid. You have a complete audit trail of every sharing event.

**Key features:**
- `agentverse share --with <domain> --purpose <purpose>` sends a Verifiable Presentation via Google A2A protocol
- Agent Card discovery and Zod schema validation
- Interactive consent prompt when no pre-authorized policy exists ([y] Allow once, [a] Always allow, [n] Deny)
- BBS+ selective disclosure: VP contains only user-approved claims; hidden claims are cryptographically inaccessible
- 3 disclosure presets: `minimal` (skills only), `professional` (skills + experience + values + availability + lookingFor), `full` (everything)
- Policy files for pre-authorized sharing rules (per-agent, per-purpose)
- SHA-256 hash-chained append-only audit log with tamper detection
- Mock agent in repo for testing and demos
- All credentials self-labeled as "self-attested" (never "verified")

**Success metrics:**
| Metric | Target | Actual |
|--------|--------|--------|
| End-to-end flow (extract → issue → share → verify) passes | Pass/fail | PASSED |
| Time from install to first share (with mock agent) | < 10 minutes | ~5 minutes |
| Tests passing | > 60 | 66 |

**This is the MVP.** Phase 1 is complete. The product is a "cryptographic portable resume" that can be shared with any A2A-compatible agent.

---

### M2: "Knock Knock" -- Direct Contact with Doorbell Agent Card
**Target:** Day 3-4 | **Status: DONE**

**User-facing value:** You publish a minimal "doorbell" Agent Card that tells the world what kinds of contacts you are open to (e.g., "recruiting", "cofounder search") without revealing anything else about you. When someone's agent knocks, your agent triages the request automatically -- no LLM involved, no data exposed. If it passes your policy, a scoped delegate agent evaluates the contact on your behalf using only the attributes you pre-approved.

**Key features:**
- Doorbell Agent Card: serves at `/.well-known/agent.json` with `open_to` categories and nothing else
- Deterministic triage: verify DID, check purpose against policy, auto-approve/prompt/deny -- no LLM in the triage path
- Rate limiting per sender (configurable per-hour and per-day limits)
- Filesystem-delegate model: ephemeral, capability-less scoring delegates with read-only access
- Three-tier delegate filesystem: `structured` (enum-only, LLM-safe), `evaluable_text` (defense-stack-processed), `human_only` (never touched by LLM)
- Delegate lifecycle: spawn with scoped context, score compatibility, escalate to human, destroy after interaction
- Sign-then-encrypt transport (Ed25519 signing + X25519 ECDH + AES-256-GCM) solving the sender authentication gap
- Ephemeral key pairs per message (forward secrecy)
- BBS+ referral tokens from mutual connections (non-forgeable, purpose-bound, expiring)
- Relationship records: structured persistence for ongoing connections (not raw conversation)
- `agentverse contacts` stub for managing relationship records
- `agentverse persona create` stub for ephemeral purpose-scoped identities

**Success metrics:**
| Metric | Target | Actual |
|--------|--------|--------|
| Doorbell server serves valid Agent Card | Pass/fail | PASSED |
| Deterministic triage correctly approves/denies/prompts | Pass/fail | PASSED |
| Sign-then-encrypt roundtrip (sign → encrypt → decrypt → verify) | Pass/fail | PASSED |
| Referral token issue + verify + expiry check | Pass/fail | PASSED |
| Tests passing | > 100 | 119 |

---

### M3: "Find My Match" -- Bucket Discovery and Matching
**Target:** Day 4-5 | **Status: DONE (local, simulated TEE)**

**User-facing value:** You submit an anonymous persona to a purpose-specific "bucket" (like "recruiting-swe" or "cofounder-search") and a matching engine scores you against other anonymous personas. Neither party learns the other's identity unless both opt in. This is the unlock for recruiting at scale, cofounder search, and dating -- matching without broadcasting.

**Key features:**
- Buckets: purpose-specific namespaces where agents submit coarsened, anonymized profiles
- 4 default buckets: recruiting-swe, cofounder-search, dating-general, freelance-dev
- Custom bucket creation with category + required schema fields
- Three-phase matching pipeline:
  - Phase 1: Pre-filter — inverted index over structured fields, eliminates non-overlapping candidates
  - Phase 2: Similarity scoring — cosine similarity on embeddings (when available) + field overlap scoring
  - Phase 3: PSI dealbreaker checking — mutual constraint verification (both must pass each other's constraints)
- Coarse match signals (strong/good/possible/weak) instead of numeric scores (harder to game)
- Embedding-based cosine similarity when 384-dim vectors are provided
- Match proposals: auto-created for qualifying matches, dual-sided (one for each party), with expiry
- Mutual acceptance detection: both parties must independently accept before proceeding
- Agent listings with TTL, commitment hash (commit-then-reveal fairness), and withdrawal
- Venue SDK with `SimulatedTeeVenue` class (same interface as production TEE venue)
- `agentverse discover --purpose <purpose>` — submit persona and search for matches
- `agentverse discover --list-buckets` — view available buckets
- `agentverse match` — view and respond to match proposals
- `agentverse match --accept <id>` / `--decline <id>` — respond to proposals

**Success metrics:**
| Metric | Target | Actual |
|--------|--------|--------|
| Matching engine finds correct matches from overlapping profiles | Pass/fail | PASSED |
| Dealbreaker enforcement filters incompatible matches | Pass/fail | PASSED |
| Embedding similarity correctly ranks candidates | Pass/fail | PASSED |
| Mutual acceptance detection works | Pass/fail | PASSED |
| Match proposals auto-created for qualifying matches | Pass/fail | PASSED |
| Venue SDK submits, matches, and generates proposals | Pass/fail | PASSED |
| Tests passing | > 115 | 119 |

---

### M4: "Production Launch" -- Infrastructure Deployment and Public Launch
**Target:** Day 5-7 | **Status: IN PROGRESS**

**User-facing value:** Agentverse is a real, deployed service. You can install it from npm, share with agents over the internet, and submit to buckets where real matching happens inside hardware-isolated clean rooms. The AI Profile Card goes viral on social media.

**Key features:**
- [ ] Port matching engine to Rust for AWS Nitro Enclave (EIF image)
- [ ] Deploy API server (Express/Fastify) wrapping venue SDK as REST endpoints
- [ ] AWS Nitro Enclave with KMS key release (PCR0+PCR3+PCR8 attestation)
- [ ] vsock bridge between host (TypeScript API) and enclave (Rust matching)
- [ ] Embedding generation sidecar (all-MiniLM-L6-v2 sentence-transformer, 384-dim)
- [ ] Persistent storage (PostgreSQL + pgvector for bucket data)
- [ ] Domain + TLS certificate for Agent Card serving
- [ ] `npx agentverse init` works from npm (global install)
- [ ] README as landing page with compelling demo, quickstart, architecture diagram
- [ ] AI Profile Card generator (shareable visual summary for social media)
- [ ] Show HN post + Twitter/X launch thread
- [ ] Demo video: extract → review → share → verify in 3 minutes

**Infrastructure cost estimate:**
| Component | Monthly Cost |
|-----------|-------------|
| EC2 m5.xlarge (Nitro enclave) | ~$140 |
| RDS PostgreSQL (small) | ~$50 |
| Route 53 + ACM certificate | ~$2 |
| CloudWatch monitoring | ~$10 |
| **Total** | **~$200/month** |

**Success metrics:**
| Metric | Target |
|--------|--------|
| `npx agentverse init` works from npm | Pass/fail |
| End-to-end share over real internet (not localhost) | Pass/fail |
| TEE attestation verification passes | Pass/fail |
| npm installs in first week | 500 |
| GitHub stars in first month | 200 |
| Users who complete full flow (extract + issue + share) | >= 30% of installs |
| Show HN upvotes | Top 10 of the day |

---

### M5: "Trust Network" -- Reputation, Multi-Venue, and Ecosystem Growth
**Target:** Week 2-3 | **Status: PLANNED**

**User-facing value:** The network becomes self-reinforcing. Your reputation builds across venues based on how you behave (response rate, match quality, follow-through). Referrals from trusted connections elevate your visibility. Multiple venues compete for your participation. You can verify that every venue's matching is fair via a public transparency log.

**Key features:**
- [ ] WeKruit first-party recruiting venue (curated cohort: 50-100 developers + 10-20 companies)
- [ ] 9-component reputation formula (completion rate, response time, match quality, escalation rate, etc.)
- [ ] PageRank-based Sybil resistance across the referral graph
- [ ] Tessera transparency log: all reputation scores and match receipts anchored publicly
- [ ] Match tokens: Pedersen commitment-based cryptographic receipts
- [ ] Venue stakes with collateral-backed accountability and slashing conditions
- [ ] Multi-cloud TEE support (AWS Nitro + Azure SEV-SNP + GCP TDX)
- [ ] BBS+ v2 with unlinkable proofs and ZK range predicates (Noir circuits)
- [ ] GDPR data export (`agentverse export --full`) and VP revocation
- [ ] Bridge imports: `agentverse extract --source linkedin-export.csv` and `--source github:username`

**Success metrics:**
| Metric | Target |
|--------|--------|
| Users with reputation score > 0 | 500 |
| Referral-originated matches as % of all matches | >= 20% |
| Active venues (running Venue SDK) | 5 |
| Transparency log entries | 5,000 |
| GDPR export requests successfully fulfilled | 100% |

---

### M6: "Open Protocol" -- EACP Spec Published, Community, SDK
**Target:** Week 3-4 | **Status: PLANNED**

**User-facing value:** Agentverse is no longer just a product -- it is a protocol. Any developer can build a venue, any agent can participate in the commons, and the EACP specification is public, documented, and open for community contribution. The reference implementation is production-grade and the ecosystem is self-sustaining.

**Key features:**
- [ ] EACP specification published as a versioned document (8-layer protocol stack, Apache 2.0)
- [ ] IETF Internet-Draft submitted to plant the flag
- [ ] Agent SDK in Rust, TypeScript, and Python
- [ ] Full developer documentation: API reference, integration guides, venue operator agreement template
- [ ] Homebrew formula and npm package with polished install experience
- [ ] Community governance: BDFL model with public RFC process (like Nostr NIPs)
- [ ] Reference cost model published (per-match costs, monthly fixed costs from WeKruit data)
- [ ] Demo agents for recruiting, dating, and cofounder matching
- [ ] Target one major framework integration (LangChain, CrewAI, or AutoGen)
- [ ] Conference talks and protocol working group

**Success metrics:**
| Metric | Target |
|--------|--------|
| EACP spec downloads / page views in first month | 5,000 |
| Third-party Agent SDK integrations | 10 |
| Community contributors (PRs merged) | 25 |
| Active venues | 10 |
| Monthly active users across all venues | 5,000 |
| Media mentions (blog posts, podcasts, conference talks) | 20 |

---

## 3. User Personas

### Persona 1: Maya -- The Stealth Job Seeker (Primary)

**Profile:** Senior software engineer, 6 years experience, currently employed at a mid-stage startup. Has been using Claude Code daily for the past year and ChatGPT for two years before that.

**What she cares about:** Finding her next role without alerting her current employer. She wants recruiters to find her based on what she actually knows (reflected in thousands of hours of AI conversations), not the performative bullet points on her LinkedIn. She does not want to broadcast that she is looking.

**How she discovers Agentverse:** Sees a "My AI Profile" card shared by a friend on Twitter/X. It shows a verified skills breakdown extracted from Claude Code history. She thinks: "Wait, I can see what my AI thinks I'm good at?" She installs the CLI to see her own profile.

**Her "aha moment":** Running `agentverse extract` and seeing a structured profile that captures skills she forgot she had -- obscure debugging patterns, architectural preferences, communication style. Then realizing she can share this with a recruiting agent without her employer knowing she is looking, and the recruiter can verify the claims are cryptographically signed without seeing her name.

**Journey:** M0 (extract + review) → M1 (share with recruiting agent) → M2 (publish doorbell for recruiting) → M3 (anonymous matching in "recruiting-swe" bucket)

---

### Persona 2: David -- The Technical Recruiter

**Profile:** Recruiter at a growth-stage company. Spends 60% of his time on sourcing. Tired of LinkedIn InMails with 3% response rates. Wants to find candidates who are actually looking and actually qualified, without the performative signaling.

**What he cares about:** Signal-to-noise ratio. He wants to see verified skill sets, not self-reported resume bullets. He wants to reach people who are open to recruiting conversations but not publicly broadcasting it.

**How he discovers Agentverse:** Reads an engineering blog post about "cryptographic recruiting" or hears about it at a dev conference. His company's engineering team sets up an Agent Card at `recruiting.company.com/.well-known/agent.json`.

**His "aha moment":** Receiving a VP from a candidate where the skills are BBS+ signed and selectively disclosed. He can verify that the candidate actually uses Rust and distributed systems daily without seeing their name or current employer until mutual opt-in.

**Journey:** M1 (receives VPs from candidates) → M2 (sets up doorbell for inbound) → M3 (operates a recruiting bucket) → M5 (builds reputation as a responsive, high-quality recruiter)

---

### Persona 3: Priya -- The Solo Founder Looking for a Cofounder

**Profile:** Technical founder building a climate tech startup. Has been working alone for 6 months. She needs a business cofounder who shares her values, complements her skills, and is in a compatible timezone.

**What she cares about:** Values alignment and complementary skills, not just a resume match. Traditional networking is too slow and too random.

**How she discovers Agentverse:** A YC founder she follows shares a thread about using Agentverse to find a cofounder. The idea of "values-based matching" resonates.

**Her "aha moment":** Submitting an anonymous persona to the "cofounder-search" bucket and getting a strong match with someone whose profile shows complementary skills (operations, fundraising), shared values (climate impact, autonomy), and compatible working style. Neither knows who the other is until both opt in.

**Journey:** M0 (extract + review) → M1 (share with cofounder matching agent) → M3 (anonymous matching in "cofounder-search" bucket) → M5 (referral from mutual YC connection elevates match)

---

### Persona 4: Alex -- The Privacy-Conscious Developer

**Profile:** Open source contributor, privacy advocate. Currently uses multiple AI tools but is uncomfortable with how much these companies know about him. He will read the code.

**What he cares about:** Data ownership, cryptographic guarantees (not just promises), open protocols over proprietary platforms.

**How he discovers Agentverse:** Sees the EACP protocol spec or the GitHub repo. Reads the architecture docs. Impressed that the system uses BBS+ for real selective disclosure and TEE clean rooms for matching.

**His "aha moment":** Running `agentverse share` and then verifying independently that the hidden attributes are mathematically inaccessible — not redacted, not hidden, absent. He inspects the VP and confirms it is a proper BBS+ derived proof.

**Journey:** M0 (extract, inspect the crypto) → M1 (verify selective disclosure end-to-end) → M6 (contribute to the EACP spec, build a venue)

---

## 4. Go-to-Market Strategy

### Positioning

**One-liner:** "Agentverse is a cryptographic resume built from your AI conversations -- portable, verifiable, and private by default."

**"X for Y" analogy:** "Keybase for AI-era professional identity" -- but where Keybase proved you owned your social accounts, Agentverse proves what you know and who you are based on thousands of hours of real AI interactions, with cryptographic selective disclosure so you share only what you choose.

**Category:** Privacy-preserving agent-to-agent identity. This is a new category. The closest existing concepts are self-sovereign identity (SSI) and verifiable credentials, but applied to a specific, tangible use case (professional matching) rather than abstract identity infrastructure.

### Competitive Landscape

| Competitor | What They Do | Why Agentverse Is Different |
|-----------|-------------|---------------------------|
| **LinkedIn** | Public profiles, recruiter InMails | Static, performative, no privacy. You broadcast to everyone or no one. |
| **Anthropic/OpenAI memory** | AI remembers your preferences | Trapped inside one provider. Not portable, not verifiable, not shareable. |
| **Traditional SSI (Spruce, Dock, etc.)** | Issue and verify credentials | No extraction from AI history, no matching, no agent-to-agent protocol. |
| **AI recruiting tools (HireVue, Pymetrics)** | AI-assisted hiring | Company-controlled, candidate has no agency, no selective disclosure. |
| **Dating apps (Hinge, Bumble)** | Profile-based matching | Public profiles, no privacy, no verification, centralized matching. |

**Agentverse's wedge:** Nobody else is building at the intersection of (1) AI conversation history as a data source, (2) BBS+ selective disclosure as a privacy mechanism, and (3) TEE clean rooms as a matching infrastructure.

### Launch Strategy

**M4 Launch: Developer-first, CLI-first**

1. **Hacker News "Show HN"** -- Lead with the "What does your AI think you are?" hook. Demo video: extract → review → share → verify in 3 minutes.
2. **Twitter/X thread** -- "I extracted my professional profile from 18 months of Claude Code history. Here is what my AI thinks I'm good at." Include the AI Profile Card image.
3. **Dev conference lightning talks** -- Target AI Engineer Summit, IIW, RWoT. The BBS+ selective disclosure demo is conference-worthy.
4. **GitHub README as landing page** -- Clear quickstart, compelling demo, architecture diagram. Optimize for the developer who wants to try it in 5 minutes.

### The "Spotify Wrapped" Viral Loop

The shareable artifact is the **AI Profile Card** -- a visual summary of your extracted profile that you can share on social media.

```
+-------------------------------------------+
|  My AI Profile                 agentverse  |
|                                            |
|  Top Skills (verified by 847 conversations)|
|  ████████████ Rust                         |
|  ██████████   Distributed Systems          |
|  █████████    TypeScript                   |
|  ████████     Cryptography                 |
|  ███████      System Design                |
|                                            |
|  Communication Style                       |
|  Direct . Technical . Concise              |
|                                            |
|  Values                                    |
|  Privacy . Autonomy . Open Source          |
|                                            |
|  ▸ Verify this profile (BBS+ signed)       |
|  ▸ Generate yours: npx agentverse extract  |
+-------------------------------------------+
```

This card is intrinsically interesting, contains a call-to-action, is verifiable, costs nothing to share, and creates FOMO.

### Bridge Strategy

Allow users to import existing professional data from LinkedIn (profile export CSV) and GitHub (public repos, contribution graph) as supplementary signal alongside AI conversation extraction. These imports produce lower-confidence attributes (labeled "imported, unverified") but populate the matching buckets with enough data to demonstrate value.

### M5+ Launch: Vertical-first, venue-by-venue

- Launch WeKruit (first-party recruiting venue) with a curated cohort of 50-100 developers and 10-20 companies
- Each successful match is a case study
- Expand to cofounder matching and dating

---

## 5. Metrics Dashboard

### North Star Metric

**Verified identity shares per month** -- the number of times a user shares a Verifiable Presentation with another agent.

### Leading Indicators

| Indicator | What It Signals | M4 Target | M5 Target | M6 Target |
|-----------|----------------|-----------|-----------|-----------|
| CLI installs (npm) | Top-of-funnel awareness | 500 | 5,000 | 25,000 |
| Profiles extracted | Activation | 200 | 2,000 | 10,000 |
| Credentials issued | Users trust the extraction | 100 | 1,500 | 8,000 |
| Agent Cards published (doorbell) | Willingness to receive contacts | -- | 500 | 2,500 |
| Personas submitted to buckets | Matching demand | -- | 1,000 | 10,000 |

### Lagging Indicators

| Indicator | What It Signals | M5 Target | M6 Target |
|-----------|----------------|-----------|-----------|
| Mutual identity reveals | Matching quality | 200 | 2,000 |
| Repeat shares (same user, multiple agents) | Ongoing product value | 30% of users | 50% of users |
| Third-party venues | Ecosystem health | 5 | 10 |
| Referral tokens issued | Network effects | 100 | 1,000 |
| 30-day retention | Stickiness | 25% | 40% |

### Per-Milestone Gates

| Milestone | Gate Metric | Minimum Threshold | Actual |
|-----------|-----------|-------------------|--------|
| M0 | BBS+ proof-of-concept passes | Binary pass/fail | PASSED |
| M1 | End-to-end share flow works | Binary pass/fail | PASSED (66 tests) |
| M2 | Delegate triage + sign-then-encrypt works | Binary pass/fail | PASSED (119 tests) |
| M3 | Matching engine finds correct matches | Binary pass/fail | PASSED (119 tests) |
| M4 | `npx agentverse init` works from npm | Binary pass/fail | — |
| M5 | 3 independent venues running Venue SDK | 3 venues | — |
| M6 | 5 community-contributed PRs to EACP spec | 5 PRs | — |

---

## 6. Risks and Mitigations

### Risk 1: "Nobody installs a CLI in 2026"

**Severity:** High | **Probability:** Medium

**Why it matters:** The target audience (developers) is CLI-native, but the broader audience is not.

**Mitigations:**
- **M0-M1:** CLI is deliberate. Early adopters who use Claude Code daily are CLI-fluent. A CLI signals technical credibility.
- **M4+:** Ship a lightweight web dashboard (`agentverse dashboard` opens localhost:3000) for profile review and consent management.
- **M5+:** If demand exists, build a VS Code extension. But only after the protocol is stable.
- **Escape hatch:** The shareable profile card does not require the viewer to install anything. Verification happens via a web link.

### Risk 2: "BBS+ is too obscure for users to trust"

**Severity:** Medium | **Probability:** Medium

**Mitigations:**
- **Never mention BBS+ in user-facing language.** The UI says "share only what you choose" and "hidden attributes are mathematically inaccessible."
- **Show, don't tell.** The demo includes a verification step where hidden attributes are absent from the VP -- not redacted, absent.
- **Leverage the "Spotify Wrapped" moment.** Users trust the profile card because it reflects their actual AI conversations.

### Risk 3: "No agents to match with" (Cold Start Problem)

**Severity:** High | **Probability:** High

**Mitigations:**
- **M1 is deliberately single-player.** "Portable Resume" provides value without a network.
- **WeKruit first-party venue.** Agentverse operates its own recruiting venue to bootstrap supply and demand.
- **Bridge imports.** LinkedIn and GitHub imports populate buckets with enough data to demonstrate matching quality.
- **Viral loop.** Every profile card shared on social media is a user acquisition event.
- **Partner with communities.** YC alumni Slack, dev Discord servers, open source communities.

### Risk 4: "Privacy doesn't sell"

**Severity:** Medium | **Probability:** Medium-High

**Mitigations:**
- **Lead with utility, not privacy.** The pitch is "See what your AI thinks you're good at" and "Find your next role without broadcasting that you're looking."
- **Privacy is the differentiator, not the hook.** Once users are interested, privacy is what makes them trust the system.
- **Reframe privacy as control.** "I decide who sees what, and I can prove that hidden attributes are truly hidden."

### Risk 5: "LLM extraction is inaccurate or creepy"

**Severity:** Medium | **Probability:** Medium

**Mitigations:**
- **Mandatory review before any VC issuance.** No attribute becomes a credential without explicit user confirmation.
- **Confidence scoring with transparency.** Every attribute shows its confidence level and evidence.
- **Conservative extraction.** Err toward false negatives (missing a skill) over false positives (claiming one you don't have).
- **"Dry run" mode.** `agentverse extract --dry-run` shows what would be extracted without saving.

### Risk 6: "A2A protocol does not get adoption"

**Severity:** Medium | **Probability:** Low-Medium

**Mitigations:**
- **A2A is a transport, not a dependency.** The core value (extraction + credentialing) is independent of A2A.
- **The A2A client is behind an interface.** The `AgentTransport` abstraction allows swapping the transport layer.
- **First-party agents.** WeKruit and the mock agent are Agentverse-operated.

---

## Appendix: Timeline Summary

```
Day 1-2 ──── M0: "Hello World" (extract + BBS+ PoC)              ✅ DONE
Day 2-3 ──── M1: "Portable Resume" (MVP: issue + share + audit)   ✅ DONE
Day 3-4 ──── M2: "Knock Knock" (delegates + encrypt + referrals)  ✅ DONE
Day 4-5 ──── M3: "Find My Match" (buckets + matching + venue SDK) ✅ DONE (local)
Day 5-7 ──── M4: "Production Launch" (infra + npm + Show HN)      🔧 IN PROGRESS
Week 2-3 ─── M5: "Trust Network" (reputation + multi-venue)       📋 PLANNED
Week 3-4 ─── M6: "Open Protocol" (EACP spec + SDK + community)    📋 PLANNED
```

**Current status: 119 tests passing across 7 test suites. 30+ source files. Full end-to-end flow working locally. M4 deployment is the immediate next step.**
