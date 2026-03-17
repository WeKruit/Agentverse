# Frontend Team Report 004 — CLI-as-Everything & Agent Filesystem

**Date:** 2026-03-16
**Team:** team-frontend
**Task:** task-004-frontend (P0)
**Status:** Complete

---

## Executive Summary

Three parallel research streams produced the complete product design for Clearroom CLI: terminal-first AI identity management. Key deliverables:

1. **CLI AI tool survey** — 11 tools analyzed (Claude Code, Codex CLI, Warp, aider, Cursor, Copilot CLI, Stripe/Vercel/Railway CLIs, 1Password/Bitwarden CLIs). Universal pattern: markdown instruction files + dotfile directories + 4-level config cascade.

2. **~/.clearroom/ filesystem design** — Complete directory structure with profile, per-bucket distilled agents, keys, matches, config. Based on Claude Code's ~/.claude/ and 1Password's op:// patterns.

3. **60-second onboarding flow** — 6 steps from install to first match. Based on 1Password's Emergency Kit pattern, Signal's "encryption as default" philosophy, and Bitwarden's CLI lessons (avoid env var session keys).

4. **Distilled agent UX** — Two-column included/excluded view, post-match consent gate modeled on Bumble's "women message first" + Cerca's mutual reveal pattern. PII reveal requires typing "reveal" (not y/N).

5. **Terminal visual mockups** — 7 complete ASCII screens: init, profile, distill, matches, reveal, status, errors. Design language: box-drawing, confidence bars, persistent privacy status blocks.

**Detailed research in:**
- `~/ai-dept/shared/research/clearroom-cli-tool-landscape-research.md`
- `~/ai-dept/shared/research/onboarding-flows-consent-ux-research.md`
- `~/ai-dept/shared/clearroom-cli-mockups.md` (903 lines, 7 screens)

---

## 1. Terminal-First AI Products: State of the Art

### 1.1 Cross-Tool Feature Matrix

| Tool | State Persistence | Config Structure | Auth Model | Terminal UI | Time to Value |
|------|------------------|-----------------|------------|-------------|---------------|
| **Claude Code** | ~/.claude/ + CLAUDE.md + auto memory | 4-level cascade (managed→user→project→local) | OAuth + env var API key | Ink (React) | ~2 min |
| **Codex CLI** | ~/.codex/config.toml + AGENTS.md | TOML config + markdown instructions | API key + env var | Rust full-screen TUI | ~3 min |
| **aider** | .aider.conf.yml + git auto-commit | YAML config per project | API key | Rich Python output | ~2 min |
| **Cursor** | .cursor/rules/*.mdc + YAML frontmatter | 5-layer context system | Cloud account | IDE-integrated | ~5 min |
| **Copilot CLI** | ~/.copilot/ + 28-day auto-expiring memory | Dotfile directory | Token chain (gh auth) | Terminal inline | ~1 min |
| **1Password CLI** | OS keychain via desktop app | op:// URI scheme | Biometric (Touch ID) | Clean tables | ~60 sec |
| **Bitwarden CLI** | ~/.config/Bitwarden CLI/data.json | Single encrypted blob | Session key in env var | Minimal | ~3 min |
| **Stripe CLI** | ~/.config/stripe/ | JSON config | Browser OAuth | Status messages | ~2 min |
| **Vercel CLI** | ~/.vercel/ | JSON config | Browser OAuth | Optimistic UI | ~90 sec |

### 1.2 Universal Patterns (What ALL Tools Share)

**1. Markdown instruction files are the standard.**
Claude Code has CLAUDE.md. Codex CLI has AGENTS.md. Cursor has .cursorrules → .cursor/rules/*.mdc. Copilot has copilot-instructions.md. AGENTS.md is emerging as a cross-tool standard.

**Clearroom implication:** Use `~/.clearroom/profile.md` as a human-readable view alongside `profile.json` for machine use. Users should be able to edit their profile in any text editor.

**2. 4-level config cascade.**
Every tool uses: system/org → user (~/) → project (./) → local override. Settings merge with precedence.

**Clearroom implication:** Global config at `~/.clearroom/config.toml`. Per-venue overrides at `~/.clearroom/venues/<venue>/config.toml`.

**3. 1Password's op:// URI scheme is the gold standard for secret references.**
`op://vault/item/field` lets you reference secrets without exposing them. Shell integration via `op run` injects secrets into env vars at execution time.

**Clearroom implication:** Design a `cr://` URI scheme for agent references. `cr://agents/recruiting/skills` references a specific attribute. Never store PII in plaintext config files.

**4. Biometric auth eliminates daily friction.**
1Password CLI piggybacks on the desktop app's Touch ID integration. Zero-friction daily usage after one-time setup.

**Clearroom implication:** For MVP, use OS keychain (macOS Keychain, Linux secret-service). Avoid Bitwarden's mistake of requiring `export BW_SESSION` manually.

**5. Time to first value: <90 seconds is the target.**
Best-in-class CLI tools achieve first useful operation in under 90 seconds. The SaaS industry average is <2 minutes.

### 1.3 Key Lesson from Each Tool

| Tool | Key Lesson for Clearroom |
|------|-------------------------|
| Claude Code | Auto-memory that persists learnings across sessions — our profile extraction fills the same need |
| Codex CLI | AGENTS.md as cross-tool standard — our distilled agents ARE the agent definition |
| aider | Git auto-commit on every change — we should auto-snapshot profile changes |
| Cursor | Context window management matters — distilled agents are context-compressed by design |
| 1Password | op:// URIs + biometric auth = zero-friction secrets — our model exactly |
| Bitwarden | Session key in env var is the #1 friction point — use keychain instead |
| Stripe | Browser OAuth + webhook testing = premium DX — our venue attestation check should feel this clean |
| Vercel | "Developer Experience as Design" — deployment should feel magical, not mechanical |

---

## 2. Agent Filesystem: ~/.clearroom/

### 2.1 Directory Structure

```
~/.clearroom/
├── config.toml                    # Global configuration
├── profile.json                   # Extracted structured profile (encrypted at rest)
├── profile.md                     # Human-readable profile view (gitignored)
│
├── agents/                        # Distilled agents (one per bucket/context)
│   ├── recruiting.json            # Recruiting-context agent
│   ├── recruiting.key             # Agent-specific Ed25519 keypair
│   ├── dating.json                # Dating-context agent
│   ├── dating.key
│   ├── freelance.json             # Freelancing-context agent
│   └── freelance.key
│
├── keys/                          # Encryption keys
│   ├── profile.key                # Master profile key (AES-256-GCM)
│   ├── recovery.key               # Emergency recovery key (export on init)
│   └── venues/                    # Per-venue encryption keys
│       ├── wekruit.key
│       ├── matchlab.key
│       └── freelancehub.key
│
├── venues/                        # Venue connection state
│   ├── wekruit/
│   │   ├── attestation.json       # Venue's TEE attestation certificate
│   │   ├── config.toml            # Venue-specific overrides
│   │   └── published.json         # What's currently published to this venue
│   ├── matchlab/
│   └── freelancehub/
│
├── matches/                       # Match results and receipts
│   ├── active/                    # Current matches awaiting action
│   │   ├── match-1.json
│   │   └── match-2.json
│   ├── completed/                 # Matches where reveal happened
│   │   └── match-4.json
│   ├── expired/                   # Timed-out matches
│   └── receipts/                  # Cryptographic match receipts
│       └── receipt-match-1.cbor
│
├── reveals/                       # Identity reveal history
│   └── reveals.log                # Append-only log of all PII disclosures
│
├── cache/                         # Temporary extraction artifacts
│   └── extraction-2026-03-16.json # Raw extraction output (auto-purged after 24h)
│
└── logs/                          # Audit trail
    ├── operations.log             # All clearroom operations (hash-chained)
    └── attestations.log           # Venue attestation check results
```

### 2.2 Key Design Decisions

| Decision | Rationale | Based On |
|----------|-----------|----------|
| **profile.json encrypted at rest** | Master profile never stored in plaintext. Decrypted only in memory during operations. | 1Password vault model |
| **One agent file per bucket** | Matches the Spencer conversation: "per user, per use case (bucket)." O(NK) where K is small constant. | Reference-spencer-conversation.md |
| **Per-agent keypair** | Each distilled agent has its own Ed25519 key. Compromising one agent doesn't compromise others. | Venue isolation principle |
| **Per-venue key directory** | Venue keys are isolated. Revoking a venue = deleting its key. | 1Password vault separation |
| **Human-readable profile.md** | Users should be able to read their profile in any text editor, not just the CLI. | Claude Code CLAUDE.md pattern |
| **recovery.key exported on init** | Emergency Kit pattern from 1Password. User exports recovery key to safe storage. | 1Password research |
| **Hash-chained operations.log** | Every operation is logged with SHA-256 chain. Tampering detectable. | Transparency log principle |
| **Auto-purging cache** | Extraction artifacts deleted after 24h. Minimizes data footprint. | Data minimization principle |

### 2.3 config.toml Schema

```toml
[clearroom]
version = "0.1.0"
profile_path = "~/.clearroom/profile.json"

[identity]
display_name = "Alex"  # Optional, never shared without consent
default_agent = "recruiting"

[extraction]
sources = [
  "~/.claude/",
  "~/Downloads/chatgpt-export.json",
  "~/Library/Application Support/ollama/history.db"
]
min_confidence = 0.5  # Attributes below this excluded from agents by default
re_extract_interval_days = 30

[privacy]
auto_publish = false           # Never auto-publish without explicit consent
default_reveal_fields = []     # No default PII sharing — user must choose each time
match_expiry_hours = 48        # Matches expire if not acted on
key_rotation_days = 90         # Force key rotation every 90 days

[venues]
auto_connect = false           # Don't auto-connect to new venues
require_attestation = true     # Refuse venues without TEE attestation
```

---

## 3. The 60-Second Experience: Install to First Match

### 3.1 Research Benchmarks

| Product | First-Use Time | Key Insight |
|---------|---------------|-------------|
| 1Password CLI | ~60 sec (with desktop app) | Biometric auth eliminates friction |
| Signal | ~90 sec to first message | Encryption is never explained — it's just the default |
| Bitwarden CLI | ~3 min (session key friction) | env var session key is the #1 pain point |
| Stripe CLI | ~2 min | Browser OAuth is seamless for auth |
| Vercel CLI | ~90 sec to first deploy | Zero-config auto-detection feels magical |

**Target: <90 seconds from `brew install` to seeing first match results.**

### 3.2 The 6-Step Flow

```
Step 1: INSTALL (10 sec)
  $ brew install clearroom
  # or: npm install -g @clearroom/cli
  # or: cargo install clearroom

Step 2: INIT + SCAN (20 sec)
  $ clearroom init
  → Scans ~/.claude/, chatgpt-export.json, ollama history
  → Progress bar: "Extracting profile from 847 conversations..."
  → Generates profile.json locally (encrypted, NEVER uploaded)
  → Shows confidence summary: 85 attributes, 6 categories

Step 3: REVIEW PROFILE (15 sec)
  $ clearroom profile
  → Beautiful tree-view of extracted attributes with confidence bars
  → User skims, optionally edits: `clearroom profile --edit`
  → KEY PRINCIPLE (from Signal): "Nothing to explain. It's encrypted. Always."

Step 4: DISTILL AGENT (10 sec)
  $ clearroom distill recruiting
  → Two-column view: Included (17 attrs) | Excluded (68 attrs)
  → "What This Agent Cannot Do" negative-capability box
  → User confirms with 'y'

Step 5: PUBLISH (5 sec)
  $ clearroom publish recruiting --venue wekruit
  → Encrypts agent → signs → publishes to WeKruit commons
  → "Published. Your agent is now discoverable on WeKruit."
  → Shows agent fingerprint for verification

Step 6: FIRST MATCH (~immediate for demo, <24h for real)
  $ clearroom matches
  → Shows match results with quality bars and criteria breakdown
  → THE AHA MOMENT: "Your agent matched 15/17 criteria with a company"
  → For onboarding: synthetic/demo match to show the experience immediately
```

### 3.3 Onboarding Design Principles (From Research)

| Principle | Source | Implementation |
|-----------|--------|----------------|
| **Encryption is the default, not a feature** | Signal | Never ask "do you want to encrypt?" — everything is encrypted, always |
| **Physical artifact for security** | 1Password Emergency Kit | `clearroom init` exports recovery key with explicit storage instructions |
| **No manual env vars** | Bitwarden lesson (anti-pattern) | Use OS keychain, not `export CR_SESSION` |
| **First interaction is read-only** | Privacy UX best practices | `clearroom init` scans and displays — no upload, no publish |
| **Show what's NOT shared** | 1Password vault visibility | Every screen has a Privacy block stating what stays local |
| **Deliberate pause before high-stakes actions** | Bumble consent gate | PII reveal requires typing "reveal", not just y/N |
| **Zero-config where possible** | Vercel CLI | Auto-detect conversation sources, auto-select agent attributes |

### 3.4 Critical Anti-Patterns (What We Must Avoid)

| Anti-Pattern | Who Did It | Our Alternative |
|-------------|-----------|-----------------|
| Session key in env var | Bitwarden (`export BW_SESSION`) | OS keychain integration |
| Account creation before value | Most SaaS | Profile extraction works with zero account |
| Uploading before consent | Dark patterns | First 3 steps are entirely local |
| Dense privacy policy text | Everyone | One sentence: "Your data never leaves this machine until you publish." |
| Pre-checked sharing defaults | Dark patterns | All sharing is opt-in, nothing shared by default |

---

## 4. Distilled Agent UX: How Users Control What's Shared

### 4.1 Agent Creation (Two-Column View)

The core trust model: users see BOTH what's included AND what's excluded. The excluded column is shown explicitly, not hidden — following the 1Password principle of making security visible.

```
  INCLUDED IN AGENT (17)                   EXCLUDED — never shared (68)
  ─────────────────────────────────────    ─────────────────────────────
  [check] React / Next.js       0.97      [cross] Salary expectations
  [check] TypeScript            0.95      [cross] Dating preferences
  [check] System architecture   0.91      [cross] Political views
  [check] API design            0.88      [cross] Health information
  [check] 8+ years engineering  0.94      [cross] Personal relationships
  [check] Remote-first          0.96      [cross] Financial situation
  [check] High agency           0.93      [cross] Exact location
  ...17 total                              ...68 total
```

**Key insight from Fishbowl research:** Each distilled agent is a "signtype" — a user-controlled identity projection for a specific context. The same person has different projections for recruiting (skills, experience) vs dating (personality, interests) vs freelancing (rates, availability).

### 4.2 Post-Match Consent Gate

Modeled on Bumble's deliberate pause + Cerca's mutual reveal pattern:

```
PHASE 1: DISCOVERY (Anonymous)
  → Distilled agents matched inside TEE. Neither party knows identities.

PHASE 2: MATCH NOTIFICATION (Pseudonymous)
  → "Match with Agent #7f3a — 15/17 criteria. Quality: 94%"
  → Shows WHICH criteria matched (categories, not values)

PHASE 3: CONSENT GATE (Selective PII Reveal)
  → Each party independently toggles: [name] [email] [phone] [linkedin]
  → Nothing visible until BOTH parties submit selections
  → Asymmetric reveals OK (A shares name+email, B shares only name)
  → Reveal encrypted to counterparty's public key

PHASE 4: SIMULTANEOUS REVEAL
  → Both see each other's selections at the same moment
  → No first-mover disadvantage (Cerca pattern)
  → Reveal is permanent and logged

PHASE 5: CONVERSATION / HANDOFF
  → Parties communicate through Clearroom channel or transition to external
```

**The "reveal" confirmation pattern:** High-stakes actions require typing the word "reveal" (not just y/N). This is borrowed from destructive operations in AWS CLI and Terraform. It forces deliberation at the exact moment it matters most.

### 4.3 Agent Editing and Redaction

```
# Remove an attribute from an agent
$ clearroom agent edit recruiting --remove "salary expectations"

# Add an attribute
$ clearroom agent edit recruiting --add "open source contributor"

# Override an extracted value
$ clearroom profile --edit skills
  > Opens inline editor for skills section

# Bulk redact sensitive categories
$ clearroom profile redact --category financial
  > Marks all financial attributes as never-share-by-default

# View what's shared where
$ clearroom agents --compare
  > Side-by-side comparison of all agents showing attribute overlap
```

### 4.4 Match Notification Options

| Channel | Implementation | When |
|---------|---------------|------|
| Terminal (default) | `clearroom matches --watch` (live refresh every 30s) | Active users in terminal |
| Desktop notification | OS-native notification via notify-send/osascript | Background operation |
| Webhook | `config.toml: webhook_url = "https://..."` | Integration with other tools |
| Email | Optional, requires account creation | Users who want async updates |

---

## 5. Terminal Visual Design

### 5.1 Design Language

| Element | Usage | Example |
|---------|-------|---------|
| **Box-drawing** (┌─┐│└─┘) | Structure panels, cards, warnings | Privacy status box on every screen |
| **Confidence bars** (████░░░░) | Attribute confidence scores | `████████░░ 0.82` |
| **Tree indentation** (├── └──) | Hierarchical data (skills under categories) | Profile viewer |
| **Check/cross** ([check]/[cross]) | Included/excluded, match/mismatch | Agent distillation, match criteria |
| **Color (minimal)** | Green=safe/included, Red=excluded/warning, Blue=info, Dim=metadata | Used sparingly, meaningfully |
| **Progress phases** | Long operations show phase-by-phase progress | Extraction: tokenize → skills → personality → confidence |

### 5.2 The Seven Screens

Full publication-quality ASCII mockups are in `~/ai-dept/shared/clearroom-cli-mockups.md` (903 lines). Summary:

| Screen | Purpose | Key Design Element |
|--------|---------|-------------------|
| `clearroom init` | First run — scan conversations, extract profile | Privacy contract banner + phase-by-phase progress |
| `clearroom profile` | View extracted profile | Tree layout with confidence bars per attribute |
| `clearroom distill` | Create context-specific agent | Two-column included/excluded + "What This Agent Cannot Do" box |
| `clearroom matches` | Match results dashboard | Quality bars + criteria check/cross grid + response windows |
| `clearroom reveal` | Post-match PII consent gate | Masked PII fields + toggle interface + type "reveal" to confirm |
| `clearroom status` | Overview dashboard | Agents, venues, matches, security state, reputation |
| Error states | Attestation failures, key rotation, expiry | "Your data was NOT transmitted" + "What to do" sections |

### 5.3 Recurring Elements (Every Screen)

**Privacy Status Block** — appears on every screen:
```
┌─ Privacy ──────────────────────────────────────────────────────┐
│  Profile: local only. 3 agents published (49 attrs shared).   │
│  6 reveals completed. 36 attributes never shared with anyone. │
└────────────────────────────────────────────────────────────────┘
```

**Next Steps** — every screen ends with actionable commands (Stripe CLI pattern):
```
  Next steps:
    clearroom profile              Review your extracted profile
    clearroom distill recruiting   Create a recruiting agent
```

**"Nothing happened" reassurance** — every error confirms what was NOT affected:
```
  Your agent was NOT published. No data was transmitted.
```

### 5.4 Framework Recommendation

| Phase | Framework | Language | Rationale |
|-------|-----------|---------|-----------|
| **Prototype (weeks 1-3)** | **Ink + Ink UI** | TypeScript | Fastest iteration. React mental model. Hot-reloading. Matches eng review's "2 languages max" (Rust + TS). |
| **Ship MVP (weeks 4-6)** | **Bubbletea + Lipgloss** | Go | OR stay with Ink. Single binary. Elm Architecture fits our state machine. Lipgloss maps 1:1 to mockups. Charm ecosystem battle-tested. |
| **Production (V2)** | **Ratatui** | Rust | If protocol layer is Rust, unify on one language. Single auditable binary. Best performance. Highest security. |

**Recommendation for 6-week MVP:** Stay in TypeScript (Ink). The eng review said "2 languages max: Rust + TypeScript." The CLI is the user-facing product; TypeScript gives us the fastest iteration on UX. Rust handles crypto and TEE. Ship the CLI in TS, port to Rust/Go only if perf or distribution becomes a bottleneck.

---

## 6. Key Recommendations

### 6.1 Immediate Actions (MVP)

| Action | Priority | Effort |
|--------|----------|--------|
| Implement `clearroom init` with Claude Code + ChatGPT source scanning | P0 | 1 week |
| Implement `~/.clearroom/` directory structure | P0 | 2 days |
| Implement `clearroom profile` viewer with confidence bars | P0 | 3 days |
| Implement `clearroom distill` with two-column included/excluded | P0 | 3 days |
| Implement OS keychain integration (avoid env var session keys) | P0 | 2 days |
| Implement `clearroom publish` with AES-256-GCM encryption | P0 | 1 week |
| Design synthetic/demo match for onboarding (show value before real matches) | P0 | 2 days |

### 6.2 Deferred (V2)

| Feature | Why Defer |
|---------|-----------|
| Ratatui/Bubbletea port | Ink is fine for MVP; port when distribution matters |
| Gemini/Ollama extraction | Start with Claude + ChatGPT (biggest user bases) |
| Agent comparison view (`--compare`) | Power user feature, not needed for first match |
| Webhook notifications | Terminal + desktop notification sufficient for MVP |
| Web dashboard alternative | CLI-first, web later if consumer demand warrants |

### 6.3 Design Principles (Non-Negotiable)

1. **Nothing leaves the machine until explicit publish.** The first 3 steps (install, init, profile) are entirely local.
2. **Every screen shows what's NOT shared.** The Privacy block is persistent, not optional.
3. **Encryption is the default, not a feature.** Never ask "do you want to encrypt?" (Signal principle).
4. **High-stakes actions require deliberate confirmation.** Type "reveal", not y/N (Terraform pattern).
5. **No dead ends.** Every screen ends with "Next steps" or "What to do."
6. **Trust through transparency.** Show algorithms, key fingerprints, attestation states — make security visible, not invisible.

---

## Source References

### CLI Tool Research
- Claude Code: claude.ai/docs, ~/.claude/ directory analysis
- Codex CLI: github.com/openai/codex (Apache-2.0 Rust rewrite)
- Warp: warp.dev/blog (Rust GPU terminal, Blocks architecture)
- aider: aider.chat/docs (git integration, edit formats)
- Cursor: cursor.com/docs (.cursor/rules, Composer mode)
- 1Password CLI: developer.1password.com/docs/cli/ (op:// URIs, biometric)
- Bitwarden CLI: bitwarden.com/help/cli/ (session key architecture)
- Stripe CLI: docs.stripe.com/stripe-cli (webhook testing, DX patterns)
- Vercel CLI: vercel.com/docs/cli (zero-config, optimistic UI)

### Onboarding & Consent UX
- 1Password Emergency Kit: support.1password.com/emergency-kit/
- Signal onboarding: builtformars.com/case-studies/creating-a-signal-account
- Bumble consent patterns: usabilitygeek.com/ux-case-study-bumble/
- Hinge most compatible: roast.dating/blog/hinge-most-compatible
- Cerca mutual reveal: cercadating.com
- Blind/Fishbowl identity tiers: rigorousthemes.com/blog/fishbowl-vs-blind
- Progressive disclosure: nngroup.com/articles/progressive-disclosure/
- Privacy-first design: smashingmagazine.com/2019/04/privacy-ux-aware-design-framework/

### Terminal UI Frameworks
- Ratatui: ratatui.rs (Rust TUI)
- Bubbletea/Lipgloss/Bubbles: github.com/charmbracelet (Go Charm ecosystem)
- Ink + Ink UI: github.com/vadimdemedes/ink (React for CLI)
- Rich/Textual: github.com/Textualize/rich (Python terminal)

### Detailed Research Files
- CLI landscape: `~/ai-dept/shared/research/clearroom-cli-tool-landscape-research.md`
- Onboarding & consent: `~/ai-dept/shared/research/onboarding-flows-consent-ux-research.md`
- Terminal mockups: `~/ai-dept/shared/clearroom-cli-mockups.md` (903 lines, 7 screens)
