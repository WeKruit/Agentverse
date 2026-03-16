# Profile Extractor — Functional Requirements

**Component**: Profile Extractor (Agentverse MVP)
**Date**: March 15, 2026
**Status**: Draft

---

## 1. Supported Input Formats

The Profile Extractor must parse conversation history from the following LLM tools. Each has a distinct storage format and location.

### 1.1 Claude Code (Priority: P0 — MVP)

**Storage locations** (all must be checked):
- `~/.claude/projects/<project-hash>/sessions/*.jsonl` — full session transcripts
- `~/.claude/history.jsonl` — global index (every prompt sent across all projects)
- `~/.claude/projects/<project-hash>/sessions-index.json` — session metadata (summaries, message counts, git branches, timestamps)
- `~/Library/Application Support/Claude/claude-code-sessions/` — Desktop app sessions (macOS)

**Format**: JSONL (JSON Lines) — one minified JSON object per line, append-only.

**Record schema** (per line):

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | string | Unique message ID |
| `parentUuid` | string or null | Links messages into a chain (null = conversation start) |
| `type` | enum | `"user"`, `"assistant"`, `"summary"` |
| `sessionId` | string | Groups messages into sessions |
| `timestamp` | ISO 8601 string | e.g. `"2025-11-14T23:57:23.004Z"` |
| `message.role` | string | `"user"` or `"assistant"` |
| `message.content` | string or array | String for user messages; array of blocks for assistant (text, tool_use, thinking) |
| `gitBranch` | string | Git branch at time of message |
| `cwd` | string | Working directory at time of message |
| `version` | string | Claude Code version |
| `isSidechain` | boolean | Whether message is on a side branch |
| `userType` | string | `"external"` for human users |
| `thinkingMetadata` | object | Extended thinking metadata |

**Parsing requirements**:
- REQ-IN-CC-01: Read JSONL files line-by-line (streaming) — never load entire file into memory.
- REQ-IN-CC-02: Reconstruct conversation threads using `parentUuid` chains. Handle DAG structure (messages form a directed acyclic graph, not a linear list).
- REQ-IN-CC-03: Filter out `type: "summary"` records from extraction input (these are system-generated, not user-authored).
- REQ-IN-CC-04: Extract only `type: "user"` message content for profile analysis. Assistant messages may be used for context (e.g., what question the user was answering) but are secondary signals.
- REQ-IN-CC-05: Handle `isSidechain: true` messages — include them; they represent alternative conversation paths that still contain user intent.
- REQ-IN-CC-06: Use `sessions-index.json` metadata to prioritize recent/frequent sessions over old/one-off sessions.
- REQ-IN-CC-07: Extract `cwd` and `gitBranch` as weak signals for technical skill inference (e.g., frequent work in a Python project directory suggests Python proficiency).

### 1.2 ChatGPT Data Export (Priority: P0 — MVP)

**How users obtain it**: Settings > Data Controls > Export Data. OpenAI emails a ZIP file containing `conversations.json` and `chat.html`.

**Format**: Single JSON file (`conversations.json`), minified (one massive line, no whitespace).

**Structure**:
```
[                                    // top-level array of conversations
  {
    "title": "string",              // conversation title
    "create_time": 1695704992.160,  // Unix timestamp (float)
    "mapping": {                    // DAG of message nodes, keyed by UUID
      "<uuid>": {
        "id": "<uuid>",
        "parent": "<uuid>" | null,  // null = root node
        "children": ["<uuid>", ...],
        "message": {
          "author": {
            "role": "user" | "assistant" | "system" | "tool"
          },
          "content": {
            "content_type": "text",
            "parts": ["string", ...]  // may be undefined/null for some nodes
          },
          "create_time": 1695704992.160
        }
      }
    }
  },
  ...
]
```

**Parsing requirements**:
- REQ-IN-CG-01: Parse the full JSON file. For files > 500 MB, use a streaming JSON parser (e.g., `stream-json` or `jsonstream`) to avoid loading the entire file into memory.
- REQ-IN-CG-02: Walk the `mapping` DAG starting from root nodes (`parent: null`). Sort sibling nodes by `create_time` to reconstruct chronological order.
- REQ-IN-CG-03: Handle forked conversations — ChatGPT allows message edits that create branches. Include all branches; the user's edits are themselves a signal (they cared enough to revise).
- REQ-IN-CG-04: Handle `message.content.parts` being `undefined` or `null` for certain nodes. Skip gracefully.
- REQ-IN-CG-05: Filter to `author.role === "user"` for primary extraction. Use `"assistant"` for contextual understanding only.
- REQ-IN-CG-06: Extract `title` as a topic signal (users sometimes rename conversations to meaningful labels).
- REQ-IN-CG-07: Handle multi-modal content gracefully — `parts` may contain non-text elements (image references, file uploads). Log and skip non-text parts.

### 1.3 Other LLM Tools (Priority: P1 — Post-MVP)

These formats should be supported after MVP but the extraction pipeline must be designed with a pluggable parser architecture to accommodate them.

| Tool | Export Mechanism | Format | Notes |
|------|-----------------|--------|-------|
| **Google Gemini** | Google Takeout, or browser extensions (Gemini Chat Exporter) | JSON, CSV, PDF, TXT | No official structured export API; browser extensions produce inconsistent schemas. Target JSON from Takeout. |
| **GitHub Copilot Chat** | VS Code extension stores locally | JSON (VS Code internal format) | Location: `~/.config/Code/User/globalStorage/github.copilot-chat/` (varies by OS) |
| **Cursor** | No official export | Proprietary SQLite DB | Would require reverse-engineering; lower priority |
| **Claude Web (claude.ai)** | Manual export or API | JSON | Different from Claude Code; uses web conversation format |
| **Custom / Open-source LLMs** | Varies | Typically JSON or JSONL | Ollama logs, LM Studio history, etc. |

**Architectural requirement**:
- REQ-IN-ARCH-01: Define a `ConversationParser` interface that all format-specific parsers implement. The interface produces a unified internal representation (see Section 5) regardless of source format.
- REQ-IN-ARCH-02: Auto-detect input format from file extension and content sniffing (JSONL vs JSON vs CSV). Prompt user for confirmation if ambiguous.
- REQ-IN-ARCH-03: Accept input as file path, directory path (scan recursively), or piped stdin.

---

## 2. Profile Schema — Extracted Attributes

The extracted profile is a structured document containing the following attribute categories. Each attribute includes a confidence score and provenance metadata.

### 2.1 Attribute Categories

#### 2.1.1 Skills & Expertise

| Attribute | Type | Example | Extraction Signal |
|-----------|------|---------|-------------------|
| `programmingLanguages` | `Array<{name, proficiencyLevel, yearsExperience?, confidence}>` | `{name: "Python", proficiencyLevel: "advanced", yearsExperience: 7, confidence: 0.92}` | Direct mentions ("I've been writing Python for 7 years"), code snippets shared, tool use patterns |
| `frameworks` | `Array<{name, proficiencyLevel, confidence}>` | `{name: "React", proficiencyLevel: "intermediate", confidence: 0.78}` | Direct mentions, project context, questions asked (asking advanced questions implies proficiency) |
| `tools` | `Array<{name, category, confidence}>` | `{name: "Docker", category: "devops", confidence: 0.85}` | References in conversations, `cwd` paths, project structure discussions |
| `domains` | `Array<{name, depthLevel, confidence}>` | `{name: "machine-learning", depthLevel: "practitioner", confidence: 0.88}` | Topic frequency, complexity of questions, vocabulary used |
| `softSkills` | `Array<{name, confidence}>` | `{name: "technical-writing", confidence: 0.65}` | Communication patterns, types of tasks requested |

#### 2.1.2 Interests & Hobbies

| Attribute | Type | Example |
|-----------|------|---------|
| `interests` | `Array<{topic, category, intensity, confidence}>` | `{topic: "hiking", category: "outdoors", intensity: "high", confidence: 0.90}` |
| `learningInterests` | `Array<{topic, currentLevel, confidence}>` | `{topic: "Rust", currentLevel: "beginner", confidence: 0.75}` |

**Extraction signals**: Non-work conversation topics, personal project descriptions, "I want to learn..." statements, hobby-related questions.

#### 2.1.3 Communication Style

| Attribute | Type | Example |
|-----------|------|---------|
| `verbosity` | `enum: "concise" \| "detailed" \| "varies"` | `"concise"` |
| `formality` | `enum: "casual" \| "professional" \| "academic"` | `"professional"` |
| `preferredResponseFormat` | `Array<string>` | `["bullet-points", "code-examples", "step-by-step"]` |
| `technicalDepth` | `enum: "high-level" \| "detailed" \| "expert"` | `"expert"` |
| `language` | `string` (BCP 47 tag) | `"en-US"` |

**Extraction signals**: Average message length, use of jargon, how they phrase requests, explicit style preferences ("be concise", "give me more detail").

#### 2.1.4 Values & Priorities

| Attribute | Type | Example |
|-----------|------|---------|
| `workValues` | `Array<{value, confidence}>` | `{value: "code-quality", confidence: 0.88}`, `{value: "test-coverage", confidence: 0.82}` |
| `decisionFactors` | `Array<{factor, weight, confidence}>` | `{factor: "performance", weight: "high", confidence: 0.79}` |
| `preferredApproaches` | `Array<{approach, confidence}>` | `{approach: "iterative-development", confidence: 0.71}` |

**Extraction signals**: What they ask LLMs to optimize for, code review preferences, trade-off discussions ("I'd rather have readable code than clever code").

#### 2.1.5 Career & Professional Context

| Attribute | Type | Example |
|-----------|------|---------|
| `currentRole` | `{title?, seniority?, domain?, confidence}` | `{title: "Senior Engineer", seniority: "senior", domain: "backend", confidence: 0.85}` |
| `industry` | `{name, confidence}` | `{name: "fintech", confidence: 0.72}` |
| `teamContext` | `{size?, methodology?, confidence}` | `{methodology: "agile", confidence: 0.68}` |
| `careerStage` | `enum: "student" \| "early-career" \| "mid-career" \| "senior" \| "leadership"` | `"mid-career"` |

**Extraction signals**: Project descriptions, company/product references, team size mentions, hiring-related conversations.

#### 2.1.6 Location & Demographics (Optional — User Must Opt In)

| Attribute | Type | Example | Sensitivity |
|-----------|------|---------|-------------|
| `locationGeneral` | `{city?, region?, country?, timezone?, confidence}` | `{city: "San Francisco", country: "US", timezone: "America/Los_Angeles", confidence: 0.90}` | Medium |
| `ageRange` | `{range, confidence}` | `{range: "25-34", confidence: 0.60}` | High |
| `spokenLanguages` | `Array<{language, fluency, confidence}>` | `{language: "en", fluency: "native", confidence: 0.95}` | Low |

**Extraction signals**: Time references ("it's 3am here"), location mentions, cultural references, language patterns. Age range is inferred from cultural references, technology timeline mentions, career duration — never directly requested.

### 2.2 Attribute Metadata (All Attributes)

Every extracted attribute carries:

| Meta Field | Type | Description |
|------------|------|-------------|
| `confidence` | `float [0.0, 1.0]` | Extraction confidence (see Section 3.2) |
| `sources` | `Array<{sessionId, messageUuid, timestamp}>` | Which conversation messages support this attribute |
| `firstSeen` | `ISO 8601` | Earliest evidence for this attribute |
| `lastSeen` | `ISO 8601` | Most recent evidence |
| `extractionMethod` | `enum: "explicit" \| "inferred" \| "behavioral"` | How the attribute was derived |
| `userVerified` | `boolean` | Whether the user has confirmed this attribute (default: false) |
| `sensitivity` | `enum: "low" \| "medium" \| "high"` | Privacy sensitivity classification |

### 2.3 W3C VC Claim Type Mapping

Attributes map to W3C Verifiable Credential `credentialSubject` claims using Schema.org vocabulary (JSON-LD context). The VC Data Model v2.0 (W3C Recommendation, May 2025) does not prescribe specific claim schemas — it provides the envelope, and we define the claim vocabulary.

| Profile Attribute | Schema.org Type/Property | JSON-LD `@context` |
|-------------------|-------------------------|-------------------|
| `programmingLanguages` | `schema:knowsAbout` | `https://schema.org/` |
| `frameworks`, `tools` | `schema:knowsAbout` | `https://schema.org/` |
| `domains` | `schema:knowsAbout` | `https://schema.org/` |
| `currentRole` | `schema:hasOccupation` → `schema:Occupation` | `https://schema.org/` |
| `industry` | `schema:Occupation.occupationalCategory` | `https://schema.org/` |
| `interests` | `schema:seeks` or `schema:interestIn` (custom) | `https://schema.org/` + custom context |
| `locationGeneral` | `schema:homeLocation` → `schema:Place` | `https://schema.org/` |
| `spokenLanguages` | `schema:knowsLanguage` | `https://schema.org/` |
| `ageRange` | Custom: `agentverse:ageRange` | Custom Agentverse context |
| `communicationStyle` | Custom: `agentverse:communicationPreferences` | Custom Agentverse context |
| `workValues` | Custom: `agentverse:workValues` | Custom Agentverse context |
| `softSkills` | `schema:skills` | `https://schema.org/` |

**VC requirements**:
- REQ-VC-01: Define an Agentverse JSON-LD context (`https://agentverse.dev/ns/profile/v1`) for claims that have no Schema.org equivalent.
- REQ-VC-02: Each profile attribute category becomes a separate VC (not one monolithic credential). This enables per-attribute selective disclosure.
- REQ-VC-03: All VCs use the `bbs-2023` cryptosuite for BBS+ signatures.
- REQ-VC-04: The VC `issuer` is the user's own agent (self-issued). This is honest — the user is attesting to their own attributes. Third-party attestations (employer confirms role, etc.) are a future extension.
- REQ-VC-05: All self-issued credentials must include a `"credentialType": "self-attested"` property in the VC metadata, making it explicit to verifiers that these claims are user-asserted and not third-party attested.

---

## 3. Extraction Approach

### 3.1 LLM-Based Extraction Pipeline

The extractor uses an LLM to analyze conversations and produce structured output. The extraction is NOT pattern-matching or keyword-based — it requires semantic understanding of context.

```
┌────────────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Conversation       │     │  Chunker &   │     │  LLM Extraction │     │  Aggregator  │
│  Parsers            │────>│  Sampler     │────>│  (per chunk)    │────>│  & Deduper   │
│  (CC, ChatGPT, ...) │     │              │     │                 │     │              │
└────────────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                                                                              │
                                                                              v
                                                                       ┌──────────────┐
                                                                       │  User Review  │
                                                                       │  & Approval   │
                                                                       └──────────────┘
```

**Pipeline stages**:

#### Stage 1: Parse & Normalize

- REQ-EX-01: All parsers produce a common `NormalizedConversation` format:
  ```
  {
    source: "claude-code" | "chatgpt" | ...,
    sessionId: string,
    timestamp: ISO 8601,
    messages: [
      { role: "user" | "assistant", content: string, timestamp: ISO 8601 }
    ]
  }
  ```
- REQ-EX-02: Strip tool_use blocks, code output blocks, and system messages from the normalized form. Retain user-authored text and assistant text only.

#### Stage 2: Chunk & Sample

- REQ-EX-03: Group normalized conversations into chunks of approximately 8,000 tokens each (fits within a single LLM extraction prompt context window while leaving room for the system prompt and output).
- REQ-EX-04: For histories exceeding 1,000 conversations, use stratified sampling:
  - 100% of conversations from the last 30 days
  - 50% of conversations from 30-180 days ago (random sample)
  - 20% of conversations from 180+ days ago (random sample)
  - Always include the 50 longest conversations regardless of age
- REQ-EX-05: Each chunk is processed independently (parallelizable). Chunks retain session boundaries — do not split a single conversation across chunks.

#### Stage 3: LLM Extraction (Per Chunk)

- REQ-EX-06: Use a structured output prompt that instructs the LLM to extract attributes matching the profile schema (Section 2). The prompt must:
  - Provide the target JSON schema
  - Instruct the LLM to cite specific messages as evidence
  - Instruct the LLM to assign a per-attribute confidence score
  - Instruct the LLM to distinguish between explicit statements ("I have 7 years of Python") and inferences ("user asks advanced metaclass questions, suggesting expert-level Python")
- REQ-EX-07: Use structured output / JSON mode to guarantee parseable output. Validate output against the schema using Zod.
- REQ-EX-08: The extraction LLM call must use the user's own LLM API key (Claude API or OpenAI API). Agentverse never proxies through its own infrastructure. Alternatively, support local LLM inference (Ollama) for users who want fully offline extraction.
- REQ-EX-09: Track token usage per extraction run and display cost estimate to the user before and after extraction.

#### Stage 4: Aggregate & Deduplicate

- REQ-EX-10: Merge extraction results from all chunks into a single profile. For duplicate attributes (e.g., "Python" mentioned in 20 chunks), merge by:
  - Taking the highest confidence score
  - Unioning the source references
  - Taking the most specific value (e.g., "7 years" over "several years")
  - Using the most recent `lastSeen` timestamp
- REQ-EX-11: Detect and flag conflicting attributes (see Section 4.3). Present conflicts to the user for resolution.

#### Stage 5: User Review & Approval

- REQ-EX-12: Display the full extracted profile to the user in the CLI before any VCs are created. Group by category, sorted by confidence (highest first).
- REQ-EX-13: Allow the user to:
  - Confirm an attribute (sets `userVerified: true`, boosts confidence to 1.0)
  - Edit an attribute (modifies value, sets `userVerified: true`)
  - Delete an attribute (removed from profile entirely)
  - Flag an attribute as sensitive (increases `sensitivity` level, restricts default sharing)
  - Skip review (accept all attributes at their extracted confidence levels)
- REQ-EX-14: User review is MANDATORY for attributes with `sensitivity: "high"` (age, location, demographics). These are never auto-accepted.
- REQ-EX-15: Persist the reviewed profile to `~/.agentverse/profile.json` (local, never uploaded).

### 3.2 Confidence Scoring

Confidence scores are assigned per-attribute using the following rubric:

| Score Range | Label | Criteria |
|-------------|-------|----------|
| 0.90 - 1.00 | Very High | Explicit, unambiguous statement by user ("I'm a Python developer with 7 years of experience") |
| 0.75 - 0.89 | High | Strong implicit evidence across multiple conversations (user consistently works on Python projects, asks expert-level questions) |
| 0.50 - 0.74 | Medium | Moderate evidence — mentioned a few times or inferable from context |
| 0.25 - 0.49 | Low | Weak evidence — single mention, ambiguous context, or old data |
| 0.00 - 0.24 | Very Low | Speculative inference — should be presented to user with a warning |

**Requirements**:
- REQ-CF-01: Attributes with confidence < 0.25 are excluded from the profile by default. User can opt in to see them during review.
- REQ-CF-02: Confidence is boosted by +0.1 (capped at 0.99) for each additional independent conversation that supports the attribute, up to 5 conversations.
- REQ-CF-03: Confidence decays by 0.05 per 90 days since `lastSeen`, down to a floor of 0.25. This handles staleness (Section 4.4).
- REQ-CF-04: Conflicting evidence reduces confidence (Section 4.3).

### 3.3 Incremental Updates vs Full Re-extraction

- REQ-INC-01: The first run is always a full extraction across all available history.
- REQ-INC-02: Subsequent runs are incremental by default:
  - Track the most recent `timestamp` processed per source in `~/.agentverse/extraction-state.json`.
  - On re-run, only process conversations newer than the last extraction timestamp.
  - Merge new extractions into the existing profile (same deduplication/conflict rules as Stage 4).
- REQ-INC-03: User can force a full re-extraction with `--full` flag, which reprocesses all history and replaces the profile (after re-review).
- REQ-INC-04: Incremental runs should complete in < 30 seconds for a typical week of conversations (approximately 50-100 conversations).

---

## 4. Edge Cases & Constraints

### 4.1 Privacy — Sensitive Data in Conversations

Conversations frequently contain passwords, API keys, tokens, PII, and other sensitive data.

- REQ-PR-01: Before sending conversation chunks to the extraction LLM, run a pre-processing filter that redacts:
  - API keys and tokens (regex patterns: `sk-`, `ghp_`, `AKIA`, `Bearer `, etc.)
  - Passwords (any value following "password", "passwd", "secret", etc.)
  - Email addresses
  - Phone numbers
  - Credit card numbers
  - Social Security Numbers / government IDs
  - Private keys (PEM blocks, SSH keys)
- REQ-PR-02: Use a well-tested redaction library (e.g., `detect-secrets`, `scrubadub`, or custom regex set). Log redaction counts but never log redacted values.
- REQ-PR-03: The extraction LLM prompt must explicitly instruct: "Do NOT extract or include passwords, API keys, tokens, specific account numbers, or other security credentials in the profile."
- REQ-PR-04: If extraction is performed via API call (not local LLM), warn the user that conversation data will be sent to a third-party LLM provider. Require explicit `--confirm-remote` flag or interactive confirmation.
- REQ-PR-05: The extracted profile must NEVER contain raw conversation text. Only structured attributes and source references (sessionId + messageUuid for provenance, not message content).

### 4.2 Size — Very Large Conversation Histories

- REQ-SZ-01: Support conversation histories up to 10 GB in total size across all sources.
- REQ-SZ-02: Use streaming parsers for all input formats. Maximum memory usage during parsing must not exceed 512 MB regardless of input size.
- REQ-SZ-03: For JSONL files, read line-by-line using a readline stream. Never call `JSON.parse()` on the entire file.
- REQ-SZ-04: For ChatGPT `conversations.json` files > 500 MB, use a streaming JSON parser (e.g., `stream-json`, `clarinet`, or `oboe.js`).
- REQ-SZ-05: Display a progress indicator during extraction (percentage complete, estimated time remaining, conversations processed / total).
- REQ-SZ-06: Support `--max-conversations N` flag to limit extraction to the N most recent conversations.
- REQ-SZ-07: Support `--since YYYY-MM-DD` flag to limit extraction to conversations after a date.

### 4.3 Accuracy — Conflicting Information

Users may state conflicting things across conversations (they changed jobs, moved cities, or were speaking hypothetically).

- REQ-AC-01: Detect conflicts during aggregation. Two attributes conflict if they address the same property but have incompatible values (e.g., `city: "San Francisco"` and `city: "New York"`).
- REQ-AC-02: Resolution strategy (automatic):
  1. Prefer the most recent evidence (`lastSeen` timestamp)
  2. Prefer explicit statements over inferences
  3. Prefer higher-confidence extractions
  4. If still ambiguous, keep both with a `conflictsWith` cross-reference and present to user
- REQ-AC-03: When presenting conflicts to the user, show the source messages for each conflicting value so they can make an informed choice.
- REQ-AC-04: Reduce confidence of conflicted attributes by 0.15 until user resolves the conflict.

### 4.4 Freshness — Outdated Information

- REQ-FR-01: Apply time-decay to confidence scores. Attributes not reaffirmed within 180 days lose 0.05 confidence per 90 days (see REQ-CF-03).
- REQ-FR-02: Mark attributes as `stale` if their `lastSeen` is > 365 days ago. Stale attributes are excluded from default sharing but remain in the profile for user review.
- REQ-FR-03: Certain attribute types decay faster than others:
  - `currentRole`, `locationGeneral`: 90-day decay (people change jobs and move)
  - `programmingLanguages`, `frameworks`: 180-day decay (skills evolve slowly)
  - `interests`, `values`: 365-day decay (relatively stable)
  - `spokenLanguages`: no decay (essentially permanent)
- REQ-FR-04: On each incremental extraction, reaffirm attributes that appear again in new conversations (reset their `lastSeen` and restore decayed confidence).

### 4.5 Conversation Context Misinterpretation

- REQ-CX-01: The extraction prompt must instruct the LLM to distinguish between:
  - Statements about the user themselves ("I've been coding in Go for 3 years")
  - Statements about someone else ("My colleague uses Go")
  - Hypothetical statements ("If I were to learn Go...")
  - Questions that do NOT imply knowledge ("What is Go?")
  - Role-playing or creative writing contexts
- REQ-CX-02: Only first-person, non-hypothetical, non-question statements should produce `extractionMethod: "explicit"`. All others are `"inferred"` with lower confidence.

---

## 5. Output Format — Pre-VC Profile

The extracted profile is stored locally as JSON before being converted to Verifiable Credentials.

### 5.1 Profile Document Schema

**File location**: `~/.agentverse/profile.json`

```jsonc
{
  "version": "1.0.0",
  "profileId": "<uuid>",
  "createdAt": "2026-03-15T10:30:00Z",
  "updatedAt": "2026-03-15T14:22:00Z",
  "extractionMetadata": {
    "sources": [
      {
        "type": "claude-code",
        "path": "~/.claude/projects/",
        "conversationsProcessed": 847,
        "messagesProcessed": 12340,
        "lastExtractedTimestamp": "2026-03-15T09:00:00Z"
      },
      {
        "type": "chatgpt",
        "path": "~/Downloads/chatgpt-export/conversations.json",
        "conversationsProcessed": 423,
        "messagesProcessed": 8901,
        "lastExtractedTimestamp": "2026-03-15T09:05:00Z"
      }
    ],
    "totalTokensUsed": 245000,
    "estimatedCost": "$0.73",
    "extractionDuration": "2m 34s"
  },

  "skills": {
    "programmingLanguages": [
      {
        "name": "Python",
        "proficiencyLevel": "advanced",
        "yearsExperience": 7,
        "confidence": 0.92,
        "sources": [
          {"sessionId": "abc-123", "messageUuid": "def-456", "timestamp": "2026-03-10T14:00:00Z"},
          {"sessionId": "ghi-789", "messageUuid": "jkl-012", "timestamp": "2026-02-28T09:15:00Z"}
        ],
        "firstSeen": "2025-06-15T10:00:00Z",
        "lastSeen": "2026-03-10T14:00:00Z",
        "extractionMethod": "explicit",
        "userVerified": true,
        "sensitivity": "low"
      }
    ],
    "frameworks": [ /* same structure */ ],
    "tools": [ /* same structure */ ],
    "domains": [ /* same structure */ ],
    "softSkills": [ /* same structure */ ]
  },

  "interests": {
    "interests": [ /* {topic, category, intensity, confidence, ...metadata} */ ],
    "learningInterests": [ /* same structure */ ]
  },

  "communicationStyle": {
    "verbosity": "concise",
    "formality": "professional",
    "preferredResponseFormat": ["bullet-points", "code-examples"],
    "technicalDepth": "expert",
    "language": "en-US",
    "confidence": 0.85,
    "sources": [ /* ... */ ],
    "userVerified": false,
    "sensitivity": "low"
  },

  "values": {
    "workValues": [ /* {value, confidence, ...metadata} */ ],
    "decisionFactors": [ /* {factor, weight, confidence, ...metadata} */ ],
    "preferredApproaches": [ /* {approach, confidence, ...metadata} */ ]
  },

  "career": {
    "currentRole": { /* {title, seniority, domain, confidence, ...metadata} */ },
    "industry": { /* {name, confidence, ...metadata} */ },
    "teamContext": { /* {size, methodology, confidence, ...metadata} */ },
    "careerStage": "mid-career"
  },

  "demographics": {
    "locationGeneral": { /* {city, region, country, timezone, confidence, ...metadata} */ },
    "ageRange": { /* {range, confidence, ...metadata} */ },
    "spokenLanguages": [ /* {language, fluency, confidence, ...metadata} */ ]
  },

  "conflicts": [
    {
      "attribute": "career.currentRole.title",
      "values": [
        {"value": "Senior Engineer", "lastSeen": "2026-03-01", "confidence": 0.85},
        {"value": "Staff Engineer", "lastSeen": "2026-03-10", "confidence": 0.78}
      ],
      "resolved": false
    }
  ],

  "userReview": {
    "lastReviewedAt": "2026-03-15T11:00:00Z",
    "attributesConfirmed": 24,
    "attributesEdited": 3,
    "attributesDeleted": 2,
    "attributesFlagged": 1
  }
}
```

### 5.2 Profile-to-VC Transformation Requirements

- REQ-OUT-01: Each top-level attribute category (`skills`, `interests`, `communicationStyle`, `values`, `career`, `demographics`) maps to one Verifiable Credential.
- REQ-OUT-02: Within each VC, individual attributes are separate claims in the `credentialSubject`. BBS+ signatures over individual claims enable per-claim selective disclosure.
- REQ-OUT-03: Only attributes with `userVerified: true` OR `confidence >= 0.50` are eligible for VC issuance. Attributes below this threshold remain in the local profile but are not credentialized.
- REQ-OUT-04: The `sensitivity` field determines the default sharing policy:
  - `low`: Shareable by default with any verified agent
  - `medium`: Requires explicit user consent per sharing request
  - `high`: Requires explicit user consent AND in MVP, shared via BBS+ selective disclosure of range/generalized values (e.g., `age_range` not exact age). Phase 2 adds ZK predicate proofs for additional privacy.
- REQ-OUT-05: The `conflicts` array must be empty (all conflicts resolved) before VCs can be issued. The CLI must block VC issuance and prompt the user to resolve conflicts first.
- REQ-OUT-06: In MVP, the profile-to-VC transformation uses hardcoded disclosure presets (`minimal`, `professional`, `full`) rather than per-field attribute picking. Each preset defines a fixed set of attribute categories and sensitivity levels included in the disclosed credential. Per-field granularity is deferred to a future release.

---

## 6. Non-Functional Requirements

### 6.1 Performance

- REQ-NF-01: Full extraction of 1,000 conversations must complete within 10 minutes (excluding LLM API latency — measure only parsing, chunking, aggregation time).
- REQ-NF-02: Incremental extraction of 50 new conversations must complete within 30 seconds (excluding LLM API latency).
- REQ-NF-03: Memory usage must not exceed 512 MB during extraction regardless of input size.

### 6.2 Security

- REQ-NF-04: The profile file (`~/.agentverse/profile.json`) must be created with file permissions `0600` (owner read/write only).
- REQ-NF-04a: The profile file must be encrypted at rest using AES-256-GCM with a key derived via Argon2id from a user-supplied passphrase. The file on disk must never contain plaintext profile data. The CLI must prompt for the passphrase on any operation that reads or writes the profile.
- REQ-NF-05: Extraction state (`~/.agentverse/extraction-state.json`) must also be `0600`.
- REQ-NF-06: No conversation content or profile data is ever written to system logs, temp files, or crash reports.
- REQ-NF-07: If the user interrupts extraction (Ctrl+C), partial results must be cleaned up — no partial profile files left on disk.

### 6.3 Usability

- REQ-NF-08: First-run experience: `agentverse extract` with no arguments should auto-detect Claude Code history at default paths and prompt to proceed.
- REQ-NF-09: Provide `--dry-run` flag that shows what would be extracted (sources found, conversation count, estimated cost) without performing extraction.
- REQ-NF-10: Provide `--verbose` flag that shows extraction progress including per-chunk results.
- REQ-NF-11: Error messages must be actionable. Examples:
  - "No Claude Code history found at ~/.claude/projects/. Run Claude Code first, or specify a custom path with --source."
  - "ChatGPT export file is 2.3 GB. This will use approximately 500K tokens (~$1.50). Proceed? [y/N]"

---

## Appendix: Research Sources

- [Claude Code's hidden conversation history](https://kentgigger.com/posts/claude-code-conversation-history)
- [Building a conversation search skill for Claude Code](https://alexop.dev/posts/building-conversation-search-skill-claude-code/)
- [Claude Code conversation extractor (GitHub)](https://github.com/ZeroSumQuant/claude-conversation-extractor)
- [Claude JSONL browser (GitHub)](https://github.com/withLinda/claude-JSONL-browser)
- [Claude Code session continuation internals](https://blog.fsck.com/releases/2026/02/22/claude-code-session-continuation/)
- [Claude Code data structures (Gist)](https://gist.github.com/samkeen/dc6a9771a78d1ecee7eb9ec1307f1b52)
- [Messages as commits: Claude Code's DAG structure](https://piebald.ai/blog/messages-as-commits-claude-codes-git-like-dag-of-conversations)
- [ChatGPT data export — parsing conversations.json (OpenAI Community)](https://community.openai.com/t/decoding-exported-data-by-parsing-conversations-json-and-or-chat-html/403144)
- [ChatGPT conversations.json JSON structures (OpenAI Community)](https://community.openai.com/t/questions-about-the-json-structures-in-the-exported-conversations-json/954762)
- [Export ChatGPT to JSON guide](https://www.ai-toolbox.co/chatgpt-toolbox-features/export-chatgpt-to-json-complete-guide)
- [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C Verifiable Credentials 2.0 Recommendation announcement](https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/)
- [W3C Verifiable Credentials Overview](https://www.w3.org/TR/vc-overview/)
- [Schema.org Person type](https://schema.org/Person)
- [Schema.org knowsAbout property](https://aubreyyung.com/knowsabout-schema/)
- [Schema.org skills property](https://schema.org/skills)
- [Schema.org Occupation type](https://schema.org/Occupation)
- [Google A2A Protocol specification](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub repository](https://github.com/a2aproject/A2A)
- [Google A2A announcement blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [IBM: What is Agent2Agent Protocol](https://www.ibm.com/think/topics/agent2agent-protocol)
