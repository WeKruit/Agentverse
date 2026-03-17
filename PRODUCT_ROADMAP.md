# Agentverse Product Roadmap

**Version:** 1.0
**Last Updated:** March 16, 2026
**Status:** Active

---

## 1. Product Vision

Agentverse is a privacy-preserving system that lets people extract a verifiable professional and personal profile from their AI conversation history and share it -- selectively, cryptographically, and on their own terms -- with other people's AI agents for recruiting, dating, cofounder search, and any high-stakes human matching scenario.

**Who it is for:** Developers, job seekers, founders, and anyone who has invested hundreds of hours talking to AI assistants and wants that accumulated self-portrait to work for them -- without surrendering control of their data.

**What problem it solves:** Today, your richest self-description lives inside ChatGPT and Claude conversations that are trapped, non-portable, and invisible to the outside world. Meanwhile, LinkedIn profiles are public, static, and performative. Recruiting, dating, and cofounder matching all suffer from the same structural problem: to find a match, you must broadcast your identity to strangers before knowing if a match even exists. Agentverse inverts this. Your AI agent shares only what you approve, only with agents you trust, only for purposes you consent to -- and cryptographic selective disclosure means hidden attributes are mathematically inaccessible, not just hidden behind a UI toggle.

---

## 2. Product Milestones

### M0: "Hello World" -- First Working Demo
**Target:** Week 3 (April 6, 2026)

**User-facing value:** You run a single command and see your AI-extracted professional profile for the first time. The BBS+ cryptographic foundation is proven and working under the hood.

**Key features:**
- `agentverse init` generates cryptographic keys and sets up `~/.agentverse/`
- `agentverse extract` parses Claude Code JSONL history into a structured profile
- `agentverse profile` displays your extracted skills, interests, values, career context, and communication style
- BBS+ selective disclosure proof-of-concept passes (sign a VC, derive a proof, verify it independently)
- Profile encrypted at rest with user passphrase

**Success metrics:**
| Metric | Target |
|--------|--------|
| Time from install to first profile view | < 5 minutes |
| Extraction accuracy (user confirms >= 80% of attributes are correct) | >= 80% |
| BBS+ sign + derive + verify cycle completes | Pass/fail gate |

**Risk gate:** If BBS+ proof-of-concept fails in Week 1 (5-day hard deadline), fall back to Ed25519 per-attribute VCs. This preserves selective disclosure at the VC level but loses cryptographic unlinkability within a single credential.

---

### M1: "My AI Profile" -- Extract, Review, and Own Your Profile
**Target:** Week 4 (April 13, 2026)

**User-facing value:** You can extract your profile from both Claude Code and ChatGPT, review every attribute interactively, correct mistakes, delete what you don't want, and issue cryptographically signed credentials over the result. You own a verifiable, portable representation of who you are.

**Key features:**
- `agentverse extract` supports both Claude Code JSONL and ChatGPT `conversations.json` exports
- `agentverse profile --review` provides interactive two-column review: Included (exchange info) vs. Excluded (PII vault)
- 4-tier progressive coarsening ("Stripe" becomes "FAANG-tier fintech", "7 years" becomes "5-10 years")
- `agentverse credentials issue` produces BBS+ signed W3C Verifiable Credentials, one per attribute category
- Confidence scoring with time decay; mandatory review for high-sensitivity attributes
- PII redaction filter (regex + NER patterns) runs before any LLM sees conversation data
- All credentials self-labeled as "self-attested" (never "verified")

**Success metrics:**
| Metric | Target |
|--------|--------|
| ChatGPT + Claude Code extraction both produce valid profiles | Pass/fail |
| User review completion rate (users who start review finish it) | >= 70% |
| Attributes flagged as incorrect during review | < 20% |
| VC issuance time (all categories) | < 30 seconds |

---

### M2: "Portable Resume" -- Issue Credentials and Share with an Agent
**Target:** Week 6 (April 27, 2026)

**User-facing value:** You can share a selective, cryptographically verifiable presentation of your profile with any agent that publishes a standard Agent Card. You choose exactly which attributes to reveal. The agent can verify the proof but cannot access anything you hid. You have a complete audit trail of every sharing event.

**Key features:**
- `agentverse share --with <domain> --purpose <purpose>` sends a Verifiable Presentation via Google A2A protocol
- Agent Card discovery and JWS signature verification (unsigned cards rejected)
- Interactive consent prompt when no pre-authorized policy exists
- BBS+ selective disclosure: VP contains only user-approved claims; hidden claims are cryptographically inaccessible
- Policy files for pre-authorized sharing rules (per-agent, per-purpose, with expiry and request limits)
- Append-only audit log of all sharing events
- Mock agent in repo for testing and demos
- Demo "Skills Portfolio" web page that verifies and displays a received VP
- `npx agentverse init` works from npm

**Success metrics:**
| Metric | Target |
|--------|--------|
| End-to-end flow (extract -> issue -> share -> verify) passes | Pass/fail |
| Time from install to first share (with mock agent) | < 10 minutes |
| npm installs in first week of launch | 500 |
| GitHub stars in first month | 200 |
| Users who complete full flow (extract + issue + share) | >= 30% of installs |

**This is the MVP ship date.** Phase 1 is complete. The product is a "cryptographic portable resume" that can be shared with any A2A-compatible agent.

---

### M3: "Knock Knock" -- Direct Contact with Doorbell Agent Card
**Target:** Week 10 (May 25, 2026)

**User-facing value:** You publish a minimal "doorbell" Agent Card that tells the world what kinds of contacts you are open to (e.g., "recruiting", "cofounder search") without revealing anything else about you. When someone's agent knocks, your agent triages the request automatically -- no LLM involved, no data exposed. If it passes your policy, a scoped delegate agent evaluates the contact on your behalf using only the attributes you pre-approved.

**Key features:**
- Doorbell Agent Card: serves at `/.well-known/agent.json` with `open_to` categories and nothing else
- Deterministic triage: verify DID, check purpose against policy, auto-approve/prompt/deny -- no LLM in the triage path
- Filesystem-delegate model: ephemeral, capability-less scoring delegates with read-only access to enum-only structured data
- Three-tier delegate filesystem: `structured` (enum-only, LLM-safe), `evaluable_text` (defense-stack-processed), `human_only` (never touched by LLM)
- Sign-then-encrypt transport (DIDComm v2 authcrypt pattern) solving the sender authentication gap
- MLS encrypted sessions with forward secrecy
- BBS+ referral tokens from mutual connections
- `agentverse contacts` for managing relationship records
- `agentverse persona create` for ephemeral purpose-scoped identities

**Success metrics:**
| Metric | Target |
|--------|--------|
| Doorbell Agent Cards published by users | 100 |
| Successful 1:1 contact exchanges (both parties complete) | 50 |
| False positive rate on deterministic triage (approved contacts user would have denied) | < 5% |
| Median time from contact request to human decision | < 2 hours |

---

### M4: "Find My Match" -- Bucket Discovery and TEE Matching
**Target:** Week 18 (July 20, 2026)

**User-facing value:** You submit an anonymous persona to a purpose-specific "bucket" (like "senior-swe-sf" or "climate-tech-cofounder") and a TEE clean room scores you against other anonymous personas. Neither party learns the other's identity unless both opt in. This is the unlock for recruiting at scale, cofounder search, and dating -- matching without broadcasting.

**Key features:**
- Buckets: purpose-specific namespaces where agents submit coarsened, anonymized profiles
- TEE clean rooms (AWS Nitro Enclaves): encrypted profiles decrypted only inside attested hardware; raw data never exits
- HNSW vector search (10-30ms) + PSI eligibility gates inside enclave
- Match tiers (A through F) as output -- no raw data, just a compatibility signal
- Anonymous introduction: venue-mediated PQXDH key exchange between matched parties
- Post-match protocol: exchange `human_readable` sections, human reviews, identity reveal via BBS+ (type "reveal" to confirm)
- Venue SDK (Rust + TypeScript bindings) with 7 interfaces
- WeKruit: first-party reference venue for technical recruiting
- `agentverse discover` and `agentverse match` fully functional

**Success metrics:**
| Metric | Target |
|--------|--------|
| Personas submitted to buckets | 1,000 |
| Matches where both parties opted for identity reveal | 200 |
| Median match quality rating (1-5, rated by both parties) | >= 3.5 |
| Time from persona submission to first match notification | < 24 hours |
| Third-party venues running Venue SDK | 2 |
| TEE attestation verification rate | 100% |

---

### M5: "Trust Network" -- Reputation, Referrals, and Multi-Venue
**Target:** Week 26 (September 14, 2026)

**User-facing value:** The network becomes self-reinforcing. Your reputation builds across venues based on how you behave (response rate, match quality, follow-through). Referrals from trusted connections elevate your visibility. Multiple venues compete for your participation. You can verify that every venue's matching is fair via a public transparency log.

**Key features:**
- 9-component reputation formula (completion rate, response time, match quality, escalation rate, etc.)
- PageRank-based Sybil resistance across the referral graph
- Tessera transparency log: all reputation scores and match receipts anchored publicly
- Match tokens: Pedersen commitment-based cryptographic receipts
- Venue stakes with collateral-backed accountability and slashing conditions
- Multi-cloud TEE support (AWS Nitro + Azure SEV-SNP + GCP TDX)
- BBS+ v2 with unlinkable proofs and ZK range predicates (Noir circuits)
- GDPR data export (`agentverse export --full`) and VP revocation

**Success metrics:**
| Metric | Target |
|--------|--------|
| Users with reputation score > 0 (at least one completed interaction) | 500 |
| Referral-originated matches as % of all matches | >= 20% |
| Active venues (running Venue SDK) | 5 |
| Transparency log entries | 5,000 |
| GDPR export requests successfully fulfilled | 100% |

---

### M6: "Open Protocol" -- EACP Spec Published, Reference Implementation, Community
**Target:** Week 30 (October 12, 2026)

**User-facing value:** Agentverse is no longer just a product -- it is a protocol. Any developer can build a venue, any agent can participate in the commons, and the EACP specification is public, documented, and open for community contribution. The reference implementation is production-grade and the ecosystem is self-sustaining.

**Key features:**
- EACP specification published as a versioned document (6-layer protocol stack)
- Agent SDK in Rust, TypeScript, and Python
- Full developer documentation: API reference, integration guides, venue operator agreement template
- Homebrew formula and npm package with polished install experience
- Community governance model for protocol evolution
- Reference cost model published (per-match costs, monthly fixed costs from WeKruit data)
- Demo agents for recruiting, dating, and cofounder matching
- Conference talks and protocol working group

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

**Journey:** M1 (extract + review) -> M2 (share with recruiting agent) -> M3 (publish doorbell for recruiting) -> M4 (anonymous matching in "senior-swe-sf" bucket)

---

### Persona 2: David -- The Technical Recruiter

**Profile:** Recruiter at a growth-stage company. Spends 60% of his time on sourcing. Tired of LinkedIn InMails with 3% response rates. Wants to find candidates who are actually looking and actually qualified, without the performative signaling.

**What he cares about:** Signal-to-noise ratio. He wants to see verified skill sets, not self-reported resume bullets. He wants to reach people who are open to recruiting conversations but not publicly broadcasting it. He is willing to run an agent that accepts Verifiable Presentations if it means higher quality leads.

**How he discovers Agentverse:** Reads an engineering blog post about "cryptographic recruiting" or hears about it at a dev conference. His company's engineering team sets up an Agent Card at `recruiting.company.com/.well-known/agent.json`.

**His "aha moment":** Receiving a VP from a candidate where the skills are BBS+ signed and selectively disclosed. He can verify that the candidate actually uses Rust and distributed systems daily (extracted from real AI conversations) without seeing their name or current employer until mutual opt-in.

**Journey:** M2 (receives VPs from candidates) -> M3 (sets up doorbell for inbound) -> M4 (operates a recruiting bucket) -> M5 (builds reputation as a responsive, high-quality recruiter)

---

### Persona 3: Priya -- The Solo Founder Looking for a Cofounder

**Profile:** Technical founder building a climate tech startup. Has been working alone for 6 months. She needs a business cofounder who shares her values, complements her skills, and is in a compatible timezone. She has been talking to her AI about strategy, values, and business decisions for months -- all of it is captured in conversation history.

**What she cares about:** Values alignment and complementary skills, not just a resume match. She wants the matching system to understand that she is looking for someone who cares about climate impact, has business operations experience, and is willing to work in a scrappy early-stage environment. Traditional networking is too slow and too random.

**How she discovers Agentverse:** A YC founder she follows shares a thread about using Agentverse to find a cofounder. The idea of "values-based matching" resonates -- this is not just skills matching, it is compatibility matching.

**Her "aha moment":** Submitting an anonymous persona to the "climate-tech-cofounder" bucket and getting a Tier A match with someone whose profile shows complementary skills (operations, fundraising), shared values (climate impact, autonomy), and compatible working style. Neither knows who the other is until both opt in.

**Journey:** M1 (extract + review) -> M2 (share with cofounder matching agent) -> M4 (anonymous matching in "climate-tech-cofounder" bucket) -> M5 (referral from mutual YC connection elevates match)

---

### Persona 4: Alex -- The Privacy-Conscious Developer

**Profile:** Open source contributor, privacy advocate, has strong opinions about data sovereignty. Currently uses multiple AI tools but is uncomfortable with how much these companies know about him. He has been following the W3C Verifiable Credentials spec and the decentralized identity space.

**What he cares about:** Data ownership, cryptographic guarantees (not just promises), open protocols over proprietary platforms. He wants to verify that the system actually works as described -- that selective disclosure is real cryptographic exclusion, not UI-level hiding. He will read the code.

**How he discovers Agentverse:** Sees the EACP protocol spec or the GitHub repo. Reads the architecture docs. Impressed that the system uses BBS+ for real selective disclosure and TEE clean rooms for matching -- not just "we promise not to look."

**His "aha moment":** Running `agentverse share` with specific attributes and then verifying independently (using the mock agent's verification output) that the hidden attributes are mathematically inaccessible. He inspects the VP and confirms it is a proper BBS+ derived proof, not just a filtered JSON blob.

**Journey:** M1 (extract, inspect the crypto) -> M2 (verify selective disclosure end-to-end) -> M6 (contribute to the EACP spec, build a venue)

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
| **Traditional SSI (Spruce, Dock, etc.)** | Issue and verify credentials | No extraction from AI history, no matching, no agent-to-agent protocol. Credential-first, not user-first. |
| **AI recruiting tools (HireVue, Pymetrics)** | AI-assisted hiring | Company-controlled, candidate has no agency, no selective disclosure. |
| **Dating apps (Hinge, Bumble)** | Profile-based matching | Public profiles, no privacy, no verification, centralized matching. |

**Agentverse's wedge:** Nobody else is building at the intersection of (1) AI conversation history as a data source, (2) BBS+ selective disclosure as a privacy mechanism, and (3) TEE clean rooms as a matching infrastructure. This combination is only possible now because BBS+ libraries have matured, TEE hardware is commodity, and hundreds of millions of people have accumulated rich AI conversation histories.

### Launch Strategy

**Phase 1 Launch (M2 -- "Portable Resume"): Developer-first, CLI-first**

1. **Hacker News "Show HN"** -- Lead with the "What does your AI think you are?" hook. The shareable profile card is the viral artifact. Demo video: extract -> review -> share -> verify in 3 minutes.

2. **Twitter/X thread** -- "I extracted my professional profile from 18 months of Claude Code history. Here is what my AI thinks I'm good at." Include the profile card image. Link to the CLI. The thread doubles as a product demo.

3. **Dev conference lightning talks** -- Target AI engineering conferences (AI Engineer Summit, AI Dev World) and identity/privacy conferences (IIW, RWoT). The BBS+ selective disclosure demo is conference-worthy.

4. **GitHub README as landing page** -- For M2, the README is the product page. Clear quickstart, compelling demo, architecture diagram. Optimize for the developer who wants to try it in 5 minutes.

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

This card:
- Is intrinsically interesting ("What does my AI think I'm good at?")
- Contains a call-to-action ("Generate yours")
- Is verifiable (link to verify the BBS+ signature)
- Costs nothing to share (screenshot + tweet)
- Creates FOMO ("Everyone is seeing their AI profile")

### Bridge Strategy: Import from LinkedIn/GitHub to Seed Buckets

**Problem:** Cold-start. Nobody has credentials yet, so there is no one to match with.

**Solution:** Allow users to import existing professional data from LinkedIn (profile export CSV) and GitHub (public repos, contribution graph) as supplementary signal alongside AI conversation extraction. These imports produce lower-confidence attributes (labeled "imported, unverified") but populate the matching buckets with enough data to demonstrate value.

**Mechanics:**
- `agentverse extract --source linkedin-export.csv` -- Parse LinkedIn profile export
- `agentverse extract --source github:username` -- Fetch public repos, languages, contribution patterns
- Imported attributes carry `extractionMethod: "imported"` and `confidence: 0.40` (below the 0.50 auto-issuance threshold, so user must explicitly confirm before VC issuance)
- This is a P1 feature for post-MVP but should ship before M4 (bucket discovery) to ensure matching quality

### Phase 2+ Launch (M3-M4): Vertical-first, venue-by-venue

- Launch WeKruit (first-party recruiting venue) with a curated cohort of 50-100 developers and 10-20 companies
- Each successful match is a case study
- Expand to cofounder matching ("YC Cofounder Matching but private") and dating ("Hinge but your AI knows you better than your photos")

---

## 5. Metrics Dashboard

### North Star Metric

**Verified identity shares per month** -- the number of times a user shares a Verifiable Presentation with another agent. This captures both product adoption (users have profiles) and product value (users trust the system enough to share).

### Leading Indicators

| Indicator | What It Signals | Target (M2) | Target (M4) | Target (M6) |
|-----------|----------------|-------------|-------------|-------------|
| CLI installs (npm) | Top-of-funnel awareness | 500 | 5,000 | 25,000 |
| Profiles extracted | Activation | 200 | 2,000 | 10,000 |
| Credentials issued | Users trust the extraction | 100 | 1,500 | 8,000 |
| Agent Cards published (doorbell) | Willingness to receive contacts | -- | 500 | 2,500 |
| Personas submitted to buckets | Matching demand | -- | 1,000 | 10,000 |

### Lagging Indicators

| Indicator | What It Signals | Target (M4) | Target (M6) |
|-----------|----------------|-------------|-------------|
| Mutual identity reveals | Matching quality (both parties valued the match enough to de-anonymize) | 200 | 2,000 |
| Repeat shares (same user, multiple agents) | Ongoing product value, not just novelty | 30% of users | 50% of users |
| Third-party venues | Ecosystem health | 2 | 10 |
| Referral tokens issued | Network effects | 100 | 1,000 |
| 30-day retention (active CLI usage) | Stickiness | 25% | 40% |

### Per-Milestone Success Criteria

| Milestone | Gate Metric | Minimum Threshold |
|-----------|-----------|-------------------|
| M0 | BBS+ proof-of-concept passes | Binary pass/fail |
| M1 | 10 real users complete extract + review | 10 users |
| M2 | 50 VP shares with non-mock agents | 50 shares |
| M3 | 25 successful 1:1 contact exchanges | 25 exchanges |
| M4 | 100 mutual opt-ins from anonymous matches | 100 reveals |
| M5 | 3 independent venues running Venue SDK | 3 venues |
| M6 | 5 community-contributed PRs to EACP spec | 5 PRs |

---

## 6. Risks and Mitigations

### Risk 1: "Nobody installs a CLI in 2026"

**Severity:** High
**Probability:** Medium

**Why it matters:** The target audience (developers and technical job seekers) is CLI-native, but the broader audience (recruiters, founders, non-technical users) is not. If the product stays CLI-only, growth is capped.

**Mitigations:**
- **M0-M2:** CLI is deliberate. The early adopter audience (developers who use Claude Code and ChatGPT daily) is CLI-fluent. A CLI also avoids the "another Electron app" fatigue and signals technical credibility.
- **M3+:** Ship a lightweight web dashboard (local-only, `agentverse dashboard` opens localhost:3000) for profile review and consent management. The crypto stays in the CLI; the web UI is a convenience layer.
- **M5+:** If demand exists, build a VS Code extension and/or a desktop app. But only after the protocol is stable -- do not invest in UI before the protocol is proven.
- **Escape hatch:** The shareable profile card (the "Spotify Wrapped" artifact) does not require the viewer to install anything. Verification happens via a web link. This expands reach beyond CLI users.

### Risk 2: "BBS+ is too obscure for users to trust"

**Severity:** Medium
**Probability:** Medium

**Why it matters:** Users do not know what BBS+ is. "Cryptographic selective disclosure" sounds like an academic exercise. If users do not trust the underlying mechanism, they will not share sensitive attributes.

**Mitigations:**
- **Never mention BBS+ in user-facing language.** The UI says "share only what you choose" and "hidden attributes are mathematically inaccessible." The crypto is invisible.
- **Show, don't tell.** The demo includes a verification step where the user can see that hidden attributes are absent from the VP -- not redacted, not hidden, absent. The mock agent's verification output explicitly states "claims not disclosed: [list]."
- **Leverage the "Spotify Wrapped" moment.** Users trust the profile card because it reflects their actual AI conversations. The crypto is a feature of the card, not the product pitch.
- **Target the Alex persona** (privacy-conscious developer) early. These users will inspect the crypto, write blog posts about it, and build credibility for the broader audience.

### Risk 3: "No agents to match with" (Cold Start Problem)

**Severity:** High
**Probability:** High

**Why it matters:** The network effect is the product. A matching system with no one to match against is useless. This is the existential risk.

**Mitigations:**
- **M2 is deliberately single-player.** "Portable Resume" provides value without a network. You extract your profile, you get the AI profile card, you share it. The network effect is a future unlock, not a launch requirement.
- **WeKruit first-party venue.** Agentverse operates its own recruiting venue (WeKruit) to bootstrap supply and demand. Curate the first cohort (50-100 developers + 10-20 companies) by hand.
- **Bridge imports.** LinkedIn and GitHub imports populate buckets with enough data to demonstrate matching quality before organic critical mass.
- **Viral loop.** Every profile card shared on social media is a user acquisition event. The "What does your AI think you're good at?" hook drives installs independent of matching demand.
- **Partner with existing communities.** YC alumni Slack, dev Discord servers, and open source communities have concentrated pools of people actively looking for cofounders, jobs, or collaborators. Offer them Agentverse as a matching layer.
- **Accept that M4 will be small.** The first TEE matching cohort will be 100-500 people. That is fine. Quality of matches matters more than quantity at this stage.

### Risk 4: "Privacy doesn't sell"

**Severity:** Medium
**Probability:** Medium-High

**Why it matters:** Signal, ProtonMail, and DuckDuckGo have all proven that privacy-first products can grow -- but slowly. Privacy is a feature, not a primary purchase driver for most people. If Agentverse leads with privacy, growth will be marginal.

**Mitigations:**
- **Lead with utility, not privacy.** The pitch is "See what your AI thinks you're good at" and "Find your next role without broadcasting that you're looking." Privacy is the how, not the what.
- **Privacy is the differentiator, not the hook.** Once users are interested (because the profile card is cool, because the matching works), privacy is what makes them trust the system with sensitive data. It is the moat, not the billboard.
- **Reframe privacy as control.** Users do not want "privacy" in the abstract. They want control: "I decide who sees what, and I can prove that hidden attributes are truly hidden." This framing resonates more broadly than "privacy-preserving cryptographic protocol."
- **Build for the Maya persona first.** A job seeker who does not want her current employer to know she is looking has an immediate, visceral reason to care about privacy. Solve her problem, and privacy sells itself.

### Risk 5: "LLM extraction is inaccurate or creepy"

**Severity:** Medium
**Probability:** Medium

**Why it matters:** If the extracted profile is wrong, users lose trust immediately. If it reveals things users did not expect (e.g., inferring political views from conversation patterns), users feel surveilled by their own tool.

**Mitigations:**
- **Mandatory review before any VC issuance.** No attribute becomes a credential without explicit user confirmation. The product cannot silently misrepresent you.
- **Confidence scoring with transparency.** Every attribute shows its confidence level and the evidence that produced it (conversation count, recency, extraction method). Low-confidence attributes are excluded by default.
- **Conservative extraction.** The extraction pipeline errs toward false negatives (missing a skill) over false positives (claiming a skill you don't have). Better to be incomplete than wrong.
- **Category-level opt-out.** Users can exclude entire categories (e.g., "never extract demographics") before extraction runs.
- **"Dry run" mode.** `agentverse extract --dry-run` shows what would be extracted without saving anything.

### Risk 6: "A2A protocol does not get adoption"

**Severity:** Medium
**Probability:** Low-Medium

**Why it matters:** Agentverse's MVP sharing mechanism is built on Google's A2A protocol. If A2A does not achieve adoption, there may be few agents to share with.

**Mitigations:**
- **A2A is a transport, not a dependency.** The core value (extraction + credentialing) is independent of A2A. If A2A stalls, the sharing layer can be adapted to other agent communication protocols (MCP extensions, custom REST APIs, DIDComm).
- **The A2A client is behind an interface.** The `AgentTransport` abstraction allows swapping the transport layer without rewriting VP generation or consent management.
- **First-party agents.** WeKruit and the mock agent are Agentverse-operated. Users can share with these regardless of broader A2A adoption.
- **A2A has Google's backing.** As of March 2026, the protocol has significant industry momentum. Betting on it is reasonable.

---

## Appendix: Timeline Summary

```
Mar 16 ──── Project Start
   |
Week 1 ──── BBS+ Proof-of-Concept (go/no-go gate)
Week 2 ──── Profile Extraction Pipeline
Week 3 ──── M0: "Hello World" (first working demo)
Week 4 ──── M1: "My AI Profile" (extract + review + credential)
Week 5 ──── Integration + Mock Agent
Week 6 ──── M2: "Portable Resume" (MVP SHIP) ◄── npm launch, Show HN
   |
Week 7-8 ── Delegate Infrastructure
Week 9-10 ─ M3: "Knock Knock" (direct contact + encrypted transport)
Week 11-12  CaMeL/FIDES Integration
Week 13-14  Referral System + Testing
   |
Week 15-16  EACP L2: Pre-Filter Search
Week 17-18  M4: "Find My Match" (TEE matching + anonymous discovery)
Week 19-20  Venue SDK + WeKruit
Week 21-22  Integration + Compliance
   |
Week 23-24  Reputation Engine
Week 25-26  M5: "Trust Network" (reputation + referrals + multi-venue)
Week 27-28  Multi-Venue + Advanced Privacy
Week 29-30  M6: "Open Protocol" (EACP spec + SDK + community)
   |
Oct 12 ──── Protocol Launch
```
