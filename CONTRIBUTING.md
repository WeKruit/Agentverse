# Contributing to Agentverse

## Quick Start

```bash
git clone https://github.com/your-org/agentverse.git
cd agentverse
npm install
npm run build
npm test  # 128+ tests should pass
```

## Development

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm test          # Run all tests
npm run typecheck # Type check without building
```

## Running Locally

```bash
# Terminal 1: Start server
node dist/cli.js serve

# Terminal 2: Full flow
export AGENTVERSE_HOME=./.agentverse-dev
node dist/cli.js init
node dist/cli.js extract --source test/fixtures/claude-code-sample.jsonl
node dist/cli.js wallet issue
node dist/cli.js discover --purpose recruiting
```

## Project Structure

```
src/
├── commands/      CLI commands
├── wallet/        BBS+ credentials (keys, VCs, VPs, storage)
├── extractor/     Profile extraction (parsers, redaction, pipeline)
├── a2a/           A2A protocol client
├── consent/       Consent manager + audit log
├── delegate/      Delegate agents (filesystem, lifecycle, triage, encryption)
├── discovery/     Matching engine (buckets, scoring, proposals, venue SDK)
├── ecosystem/     Reputation, match tokens, GDPR, SDK
├── local-server/  Local API server
└── mock-agent/    Mock A2A agent for testing
```

## How to Contribute

### Bug Reports
Open a GitHub Issue with:
- What you expected
- What happened
- Steps to reproduce
- Node.js version and OS

### Feature Proposals
Open a GitHub Issue tagged `proposal` with:
- What problem it solves
- Proposed approach
- Security implications (if any)

### Pull Requests
1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run `npm test` — all tests must pass
6. Run `npm run typecheck` — no type errors
7. Submit a PR

### What We're Looking For
- Bug fixes
- Test coverage improvements
- Parser support for new LLM tools (Gemini, Copilot, Cursor)
- Documentation improvements
- Venue implementations
- Security review and hardening

### What Needs Discussion First
- Protocol changes (EACP layers)
- New cryptographic primitives
- Breaking API changes
- New dependencies

## Code Style

- TypeScript strict mode
- Use `@ts-nocheck` only for files importing Digital Bazaar packages (no TS types available)
- Zod for all external data validation
- Tests with Vitest
- No unnecessary dependencies — prefer Node.js built-ins

## Security

If you find a security vulnerability, please report it privately via GitHub Security Advisories. Do not open a public issue.

## License

Apache 2.0. By contributing, you agree that your contributions will be licensed under the same license.
