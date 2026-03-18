# Agentverse

Privacy-preserving personal profile sharing between AI agents. Extract your profile from Claude Code and ChatGPT, issue cryptographic credentials, and share selectively with other agents — hidden attributes are mathematically inaccessible, not just hidden behind a UI toggle.

## Quick Start

```bash
# Install
npm install
npm run build

# Initialize (generates cryptographic keys)
node dist/cli.js init

# Extract your profile from Claude Code history
node dist/cli.js extract

# Or from a specific file
node dist/cli.js extract --source ~/Downloads/conversations.json

# View your profile
node dist/cli.js profile

# Issue BBS+ signed credentials
node dist/cli.js wallet issue

# View your credentials
node dist/cli.js wallet list
```

## Share with an Agent

```bash
# Start the local server (Terminal 1)
node dist/cli.js serve

# Share your profile (Terminal 2)
node dist/cli.js share --with localhost:3000 --preset minimal --force
```

Three presets control what you reveal:
- `minimal` — skills only
- `professional` — skills, experience, values, availability, looking-for
- `full` — everything

Hidden attributes aren't redacted — they're cryptographically excluded via BBS+ selective disclosure. The recipient can verify the disclosed claims are authentic but cannot access anything you didn't reveal.

## Find Matches

```bash
# Start the local server (Terminal 1)
node dist/cli.js serve

# Submit your profile for matching (Terminal 2 — "Alice")
node dist/cli.js discover --purpose recruiting

# Submit another profile (Terminal 3 — "Bob")
# Set a different data directory so Bob has his own keys/profile
AGENTVERSE_HOME=./.agentverse-bob node dist/cli.js init
AGENTVERSE_HOME=./.agentverse-bob node dist/cli.js extract --source test/fixtures/chatgpt-sample.json
AGENTVERSE_HOME=./.agentverse-bob node dist/cli.js wallet issue
AGENTVERSE_HOME=./.agentverse-bob node dist/cli.js discover --purpose recruiting

# Check for matches (either terminal)
node dist/cli.js match

# Accept or decline
node dist/cli.js match --accept <proposal-id>
```

## All Commands

```
agentverse init                     Generate keys, create ~/.agentverse/
agentverse extract [--source <path>] Extract profile from AI conversation history
agentverse profile [--json]         View your extracted profile
agentverse wallet issue             Issue BBS+ credentials from profile
agentverse wallet list              List issued credentials
agentverse wallet show <file>       Show credential details
agentverse keys show                Show your DID and public key
agentverse keys export              Export public key
agentverse share --with <domain>    Share VP with an agent
agentverse audit [--verify]         View/verify sharing audit log
agentverse serve [--port 3000]      Start local matching server
agentverse discover --purpose <p>   Submit to a matching bucket
agentverse discover --list-buckets  List available buckets
agentverse match                    View pending match proposals
agentverse match --accept <id>      Accept a match
agentverse match --decline <id>     Decline a match
```

## How It Works

### Profile Extraction
Parses your Claude Code JSONL and/or ChatGPT JSON exports. Extracts skills, interests, values, career context, and communication style. Sensitive patterns (API keys, passwords, emails) are redacted before extraction.

### BBS+ Credentials
Your profile attributes are signed with BBS+ signatures (W3C bbs-2023 cryptosuite). This enables **selective disclosure** — you can prove specific claims (like "I know Rust") without revealing other claims (like your location or career stage). Different from just "not sending" the data: the proof is cryptographic.

### Matching
Agents submit profiles to purpose-specific **buckets** (recruiting, cofounder, dating, freelance). A matching engine scores compatibility based on field overlap, embedding similarity, and mutual dealbreaker checking. Neither party sees the other's identity until both accept.

### Security Model
- **Context minimization**: agents never have data they don't need
- **Structured data only**: no free text in the scoring path (enum values from fixed taxonomies)
- **No LLM in triage**: contact requests are evaluated by deterministic policy rules
- **Sign-then-encrypt**: Ed25519 signing + X25519 ECDH + AES-256-GCM
- **Hash-chained audit log**: every sharing event is logged with tamper detection

## Development

```bash
# Run tests (128 tests across 8 suites)
npm test

# Build
npm run build

# Type check without building
npm run typecheck

# Watch mode
npm run dev
```

### Project Structure

```
src/
├── cli.ts                    Entry point
├── commands/                 CLI commands (init, extract, share, discover, etc.)
├── wallet/                   BBS+ credential wallet (keys, VCs, VPs, storage)
├── extractor/                Profile extraction (parsers, redaction, pipeline)
├── a2a/                      A2A protocol client (Agent Card, SendMessage)
├── consent/                  Consent manager (policies, audit log)
├── delegate/                 Delegate agent system (filesystem, lifecycle, triage)
├── discovery/                Matching engine (buckets, scoring, proposals, venue SDK)
├── local-server/             Local API server (substitutes for production infra)
└── mock-agent/               Mock A2A agent for testing
```

### Environment Variables

```bash
AGENTVERSE_HOME=./.agentverse-dev   # Override default ~/.agentverse/ directory
```

See [.env.example](.env.example) for all options.

## Architecture

See [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md) for the full system diagram, [RESEARCH_REPORT.md](RESEARCH_REPORT.md) for the security architecture, and [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) for deployment requirements.

## License

MIT
