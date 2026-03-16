# Agentverse MVP: A2A Client & Security Requirements

## Detailed Functional and Non-Functional Requirements

*Version: 1.0 | Date: 2026-03-15 | Scope: Phase 1 (MVP)*

---

## Table of Contents

1. [Conventions and Terminology](#1-conventions-and-terminology)
2. [R1 -- A2A Client: Agent Discovery](#2-r1----a2a-client-agent-discovery)
3. [R2 -- A2A Client: Message Exchange](#3-r2----a2a-client-message-exchange)
4. [R3 -- Agent Card Signing and Verification](#4-r3----agent-card-signing-and-verification)
5. [R4 -- Consent Manager v1](#5-r4----consent-manager-v1)
6. [R5 -- MVP Security Baseline](#6-r5----mvp-security-baseline)
7. [R6 -- Edge Cases](#7-r6----edge-cases)
8. [Appendix A: Technology Selection Rationale](#appendix-a-technology-selection-rationale)
9. [Appendix B: Deferred to Phase 2](#appendix-b-deferred-to-phase-2)
10. [Appendix C: References](#appendix-c-references)

---

## 1. Conventions and Terminology

| Term | Definition |
|------|-----------|
| **MUST / SHALL** | Absolute requirement per RFC 2119. |
| **SHOULD** | Recommended unless a legitimate reason exists to deviate. |
| **MAY** | Truly optional. |
| **Agent Card** | JSON metadata document published by an A2A server at `/.well-known/agent.json`, declaring identity, capabilities, skills, endpoints, and security requirements. |
| **VP** | Verifiable Presentation -- a W3C VC Data Model 2.0 container holding one or more Verifiable Credentials with selective disclosure. |
| **DID** | Decentralized Identifier -- a self-controlled, URI-scheme identifier resolving to a DID Document containing public keys. |
| **JWS** | JSON Web Signature (RFC 7515) -- a compact or JSON-serialized signed payload. |
| **Sharing Pipeline** | The data-minimized pipeline within the Agentverse client that loads only the approved credentials needed for a specific interaction. Replaces the earlier "Guardian Agent" concept. |
| **Agentverse Client** | The user's local Agentverse CLI application running on their machine. |
| **Third-Party Agent** | An external agent (e.g., Ditto AI, WeKruit) that requests user profile data. |

---

## 2. R1 -- A2A Client: Agent Discovery

### 2.1 Fetching Agent Cards

| ID | Requirement | Priority |
|----|------------|----------|
| R1.1 | The client MUST fetch Agent Cards via HTTPS GET to `https://{domain}/.well-known/agent.json` as defined by the A2A v1.0 specification. The path `/.well-known/agent-card.json` MUST also be attempted as a fallback for backward compatibility with pre-v1.0 agents. | MUST |
| R1.2 | The client MUST validate that the response `Content-Type` header is `application/json` or `application/a2a+json`. Any other content type MUST be rejected. | MUST |
| R1.3 | The client MUST enforce a connection timeout of 10 seconds and a response body read timeout of 30 seconds for Agent Card fetches. | MUST |
| R1.4 | The client MUST reject any Agent Card endpoint that does not use HTTPS (TLS 1.2 or higher). Plain HTTP URLs MUST be rejected without attempting a connection. | MUST |
| R1.5 | The client MUST set the `Accept` header to `application/a2a+json, application/json` on all Agent Card fetch requests. | MUST |
| R1.6 | The client MUST include the `a2a-version` header set to the supported protocol version (e.g., `0.3`) in all Agent Card requests. | MUST |
| R1.7 | The client MUST follow HTTP redirects (301, 302, 307, 308) up to a maximum of 5 hops. Redirect chains that cross domain boundaries MUST be logged as a warning and require user confirmation if the final domain differs from the originally requested domain. | MUST |
| R1.8 | The client MUST set a `User-Agent` header identifying itself as `Agentverse/{version}` to allow remote agents to identify the caller. | SHOULD |

### 2.2 Agent Card Schema Validation

| ID | Requirement | Priority |
|----|------------|----------|
| R1.9 | The client MUST validate every fetched Agent Card against the A2A v1.0 JSON Schema. Validation MUST be performed using Zod schemas mirroring the canonical A2A schema types. | MUST |
| R1.10 | The following Agent Card fields MUST be present and non-empty; absence of any one MUST cause rejection: `name` (string), `interfaces` (array with at least one entry), `capabilities` (object), `securitySchemes` (object), `security` (array with at least one entry). | MUST |
| R1.11 | Each entry in the `interfaces` array MUST contain: `url` (valid HTTPS URL), `type` (string, must be `"json-rpc"` for MVP). Entries with `type` other than `"json-rpc"` MUST be ignored (not rejected). | MUST |
| R1.12 | Each `AgentSkill` object in the `skills` array (if present) MUST contain: `id` (string), `name` (string), `description` (string). The `inputSchema` and `outputSchema` fields, if present, MUST be valid JSON Schema objects. | MUST |
| R1.13 | The client MUST validate all URLs in the Agent Card (`interfaces[].url`, `provider.homepage`, `provider.logo`) as syntactically valid URLs. Interface URLs MUST use the HTTPS scheme. | MUST |
| R1.14 | The client MUST reject Agent Cards whose serialized JSON body exceeds 1 MB to prevent resource exhaustion. | MUST |
| R1.15 | Unknown/unrecognized fields in the Agent Card MUST be preserved (not stripped) but MUST NOT influence security or routing decisions. This ensures forward compatibility. | MUST |

### 2.3 JWS Signature Verification on Agent Cards

| ID | Requirement | Priority |
|----|------------|----------|
| R1.16 | The client MUST verify the JWS signature on every Agent Card before accepting it. Unsigned Agent Cards MUST be rejected with a clear error message: `"Agent Card from {domain} is unsigned and cannot be trusted."` | MUST |
| R1.17 | The signature verification process MUST follow the canonicalization procedure: (a) parse the Agent Card JSON, (b) extract and remove the `signature` field, (c) re-serialize using deterministic JSON (lexicographically sorted keys, no whitespace), (d) verify the JWS against the canonical bytes. | MUST |
| R1.18 | The `signature` field in the Agent Card MUST contain: `signature` (base64url-encoded JWS value), `algorithm` (string, one of the accepted algorithms -- see R3), `keyId` (string, referencing a key in the agent's DID Document), `timestamp` (ISO 8601 string). | MUST |
| R1.19 | The client MUST reject Agent Card signatures older than 7 days (604,800 seconds) based on the `timestamp` field, accounting for clock skew tolerance (see R6.4). | MUST |

### 2.4 Agent Card Caching

| ID | Requirement | Priority |
|----|------------|----------|
| R1.20 | The client MUST implement a local Agent Card cache keyed by the canonical agent domain (lowercase, no trailing slash). | MUST |
| R1.21 | The cache MUST respect the `Cache-Control` HTTP header from the Agent Card response. If no `Cache-Control` header is present, the default TTL MUST be 1 hour (3600 seconds). | MUST |
| R1.22 | The maximum cache TTL MUST be capped at 24 hours (86,400 seconds), regardless of the server-provided `Cache-Control` value. | MUST |
| R1.23 | The cache MUST support conditional requests using `ETag` and `If-None-Match` headers when refreshing a cached Agent Card. If the server responds with 304 Not Modified, the cached entry MUST be reused with a refreshed TTL. | SHOULD |
| R1.24 | The cache MUST be stored on the local filesystem at `~/.agentverse/cache/agent-cards/`. Each entry MUST be a JSON file named `{domain-hash}.json` containing the Agent Card, fetch timestamp, TTL, and ETag. | MUST |
| R1.25 | The client MUST provide a CLI command `agentverse cache clear` to purge the entire Agent Card cache, and `agentverse cache clear --agent {domain}` to purge a single entry. | SHOULD |
| R1.26 | When a cached Agent Card is used for a message send operation, the client MUST re-validate the signature and schema on the cached copy. A corrupted cache entry MUST trigger a fresh fetch. | MUST |

### 2.5 Unreachable Agent Card Endpoint

| ID | Requirement | Priority |
|----|------------|----------|
| R1.27 | If the Agent Card endpoint is unreachable (connection refused, DNS resolution failure, TLS handshake failure, or timeout), the client MUST NOT fall back to a cached copy for first-contact interactions. The operation MUST fail with a clear error: `"Cannot reach agent at {domain}. The agent may be offline or the domain may be incorrect."` | MUST |
| R1.28 | For agents the user has previously interacted with successfully (exists in trust store), the client MAY offer to use a cached Agent Card with a prominent warning: `"Using cached Agent Card for {domain} (fetched {timestamp}). The agent is currently unreachable. Proceed? [y/N]"`. The default MUST be to decline. | MAY |
| R1.29 | The client MUST distinguish between transient failures (timeout, 503) and permanent failures (404, DNS NXDOMAIN) in error messages. Transient failures SHOULD suggest the user retry. Permanent failures SHOULD suggest verifying the domain. | MUST |
| R1.30 | The client MUST log all Agent Card fetch failures to the audit log (see R4.11) with: timestamp, domain, failure reason, HTTP status code (if available), whether a cache fallback was offered/accepted. | MUST |

---

## 3. R2 -- A2A Client: Message Exchange

### 3.1 SendMessage Implementation

| ID | Requirement | Priority |
|----|------------|----------|
| R2.1 | The client MUST implement the A2A `SendMessage` JSON-RPC 2.0 method. All requests MUST conform to the JSON-RPC 2.0 envelope: `{"jsonrpc": "2.0", "method": "SendMessage", "params": {...}, "id": "{request-id}"}`. | MUST |
| R2.2 | The request `id` field MUST be a UUID v4 string, generated fresh for each request, to enable idempotency detection by remote agents. | MUST |
| R2.3 | The transport MUST be HTTPS POST to the `url` specified in the Agent Card's `interfaces` array entry where `type` is `"json-rpc"`. | MUST |
| R2.4 | The `Content-Type` header MUST be `application/json`. The `Accept` header MUST be `application/json`. | MUST |
| R2.5 | The `a2a-version` header MUST be included in every request and MUST match the version used during Agent Card discovery. | MUST |
| R2.6 | The `SendMessage` params object MUST include: `message` (Message object with `role: "user"`, `parts` array, and a generated `id`), and MAY include `contextId` (string, for multi-turn interactions) and `taskId` (string, when continuing an existing task). | MUST |

### 3.2 Structured Data Parts Policy

| ID | Requirement | Priority |
|----|------------|----------|
| R2.7 | All outbound messages from the sharing pipeline to third-party agents MUST use `DataPart` exclusively for payload content. The `DataPart` MUST have `type: "data"`, a `mimeType` of `"application/json"`, and a `data` field containing a JSON object. | MUST |
| R2.8 | Outbound `DataPart` payloads MUST conform to a well-defined Agentverse JSON Schema. The schema MUST be referenced in the `schema` field of the `DataPart` using a URI pointing to the Agentverse schema registry (e.g., `https://agentverse.dev/schemas/v1/profile-share.json`). | SHOULD |
| R2.9 | The client MUST NOT send `TextPart` content in outbound messages to third-party agents. Textual metadata (e.g., purpose descriptions) MUST be embedded as fields within the `DataPart` JSON object, never as separate `TextPart` entries. | MUST |
| R2.10 | When receiving responses from third-party agents, the client MUST process `DataPart` entries and MUST ignore `TextPart` entries. `TextPart` content from external agents MUST NOT be: (a) displayed to the user as actionable instructions, (b) passed to any LLM for interpretation, (c) used to influence control flow decisions. `TextPart` content MAY be logged for debugging purposes only. | MUST |
| R2.11 | When receiving responses, `FilePart` entries MUST be rejected. The MVP client MUST NOT download, process, or store files referenced in `FilePart` entries from third-party agents. | MUST |
| R2.12 | When receiving responses, `ToolCallPart` and `ToolResultPart` entries MUST be rejected. The MVP client does not expose tools to remote agents. | MUST |

### 3.3 Sending Verifiable Presentations as Artifacts

| ID | Requirement | Priority |
|----|------------|----------|
| R2.13 | Verifiable Presentations MUST be sent as A2A Artifacts within the `SendMessage` call. The Artifact MUST have `type: "data"` and contain a single `DataPart` whose `data` field holds the complete VP JSON object. | MUST |
| R2.14 | The Artifact `mimeType` MUST be `"application/ld+json"` to indicate a JSON-LD document. | MUST |
| R2.15 | The Artifact `name` MUST be a human-readable identifier, e.g., `"agentverse-vp-{timestamp}"`. | SHOULD |
| R2.16 | The Artifact `metadata` object MUST include: `agentverse.vpVersion` (string, `"vc-data-model-2.0"`), `agentverse.disclosedAttributes` (array of strings listing the attribute names being disclosed), `agentverse.purpose` (string, the declared purpose from the consent policy). | MUST |
| R2.17 | The VP JSON object within the Artifact MUST conform to the W3C VC Data Model 2.0 Verifiable Presentation format: `@context` MUST include `"https://www.w3.org/ns/credentials/v2"` as the first entry, `type` MUST include `"VerifiablePresentation"`, `verifiableCredential` MUST contain one or more VCs, and a `proof` section MUST be present. | MUST |
| R2.18 | The VP MUST contain only the selectively disclosed attributes approved by the Consent Manager. The client MUST verify, immediately before sending, that every attribute in the VP appears in the active consent policy's `allow.attributes` list. If any attribute is not approved, the send MUST be aborted. | MUST |
| R2.18a | Verifiable Credentials issued by the user themselves (i.e., where the issuer DID matches the holder DID) MUST always be labeled `"self-attested"` in the credential metadata. The term `"verified"` MUST NOT be used for self-issued credentials. The `credentialSubject` or Artifact `metadata` MUST include `"agentverse.attestation": "self-attested"` to make the provenance unambiguous to relying parties. | MUST |

### 3.4 Task Lifecycle Management

| ID | Requirement | Priority |
|----|------------|----------|
| R2.19 | The client MUST handle the following A2A task states: `pending`, `working`, `input-required`, `completed`, `failed`, `canceled`, `rejected`. | MUST |
| R2.20 | When a `SendMessage` response returns a Task with state `completed`, the client MUST extract and validate the Artifact(s), log the successful share to the audit log, and report success to the user. | MUST |
| R2.21 | When a `SendMessage` response returns a Task with state `pending` or `working`, the client MUST poll the task status using the `GetTask` JSON-RPC method. Polling interval MUST start at 2 seconds and increase using exponential backoff (base 2) up to a maximum interval of 60 seconds. Total polling duration MUST NOT exceed 5 minutes, after which the client MUST report a timeout to the user. | MUST |
| R2.22 | The `GetTask` request MUST include the `id` (task ID) and SHOULD set `historyLength` to `1` (only latest status needed for polling). | MUST |
| R2.23 | When a Task enters `input-required` state, the client MUST: (a) extract the agent's message from the Task history, (b) present any `DataPart` content to the user as a structured prompt (ignoring `TextPart`), (c) collect user input via the CLI, (d) send a follow-up `SendMessage` with the same `taskId` and `contextId` containing the user's response as a `DataPart`. | MUST |
| R2.24 | When a Task enters `input-required`, the client MUST re-evaluate the consent policy before responding. If the agent's request asks for attributes not covered by the existing consent, the Consent Manager MUST prompt the user for additional approval. | MUST |
| R2.25 | When a Task enters `auth-required` state, the client MUST inform the user that the remote agent requires authentication and provide the authentication details from the Task status. The MVP MUST support bearer token authentication. OAuth 2.0 flows are deferred to Phase 2. | MUST |
| R2.26 | When a Task enters `failed` state, the client MUST extract the error information from `TaskStatus.error`, log it to the audit log, and display a user-friendly error message. The raw error MUST be available via `--verbose` flag. | MUST |
| R2.27 | When a Task enters `rejected` state, the client MUST inform the user: `"{agent_name} declined the request. Reason: {reason}"`. The rejection MUST be logged to the audit log. | MUST |
| R2.28 | The client MUST implement the `CancelTask` JSON-RPC method. If the user presses Ctrl+C during an active task, the client MUST send a `CancelTask` request before exiting. | SHOULD |
| R2.29 | The client MUST NOT implement streaming (`SendStreamingMessage`, `SubscribeToTask`) or push notifications in the MVP. These are deferred to Phase 2. | MUST NOT |

### 3.5 Error Handling

| ID | Requirement | Priority |
|----|------------|----------|
| R2.30 | The client MUST handle JSON-RPC 2.0 error responses. The error object MUST be parsed for `code` (integer), `message` (string), and optional `data` (object). | MUST |
| R2.31 | The client MUST map A2A-specific error codes to user-friendly messages: `TaskNotFoundError` -> `"The task no longer exists on the remote agent."`, `TaskNotCancelableError` -> `"The task has already completed and cannot be canceled."`, `UnsupportedOperationError` -> `"This agent does not support the requested operation."`, `ContentTypeNotSupportedError` -> `"This agent cannot process the data format we sent."`, `InvalidAgentResponseError` -> `"The agent returned an invalid response."`. | MUST |
| R2.32 | Network-level failures MUST be categorized and reported distinctly: DNS resolution failure -> `"Cannot resolve domain {domain}. Check the agent address."`, Connection refused -> `"Agent at {domain} is not accepting connections."`, TLS error -> `"Secure connection to {domain} failed. The agent's certificate may be invalid."`, Timeout -> `"Request to {domain} timed out after {seconds}s."`, HTTP 5xx -> `"Agent at {domain} is experiencing server errors."`. | MUST |
| R2.33 | The client MUST validate all response bodies as valid JSON. Non-JSON responses MUST be treated as `InvalidAgentResponseError`. | MUST |
| R2.34 | The client MUST validate that JSON-RPC responses contain the matching `id` field from the request. Mismatched IDs MUST be treated as a potential security issue, logged, and rejected. | MUST |

### 3.6 Retry Policies

| ID | Requirement | Priority |
|----|------------|----------|
| R2.35 | The client MUST implement automatic retry with exponential backoff for transient failures: HTTP 429 (Too Many Requests), HTTP 503 (Service Unavailable), connection timeout, connection reset. | MUST |
| R2.36 | Retry backoff MUST use the formula: `delay = min(base * 2^attempt + jitter, max_delay)` where `base = 1 second`, `jitter = random(0, 500ms)`, `max_delay = 30 seconds`. | MUST |
| R2.37 | Maximum retry count MUST be 3 attempts (4 total including the initial request). After exhausting retries, the client MUST report the failure to the user with the last error received. | MUST |
| R2.38 | The client MUST respect `Retry-After` headers. If a `Retry-After` header is present in a 429 or 503 response, the client MUST wait at least the specified duration before retrying. If `Retry-After` exceeds 120 seconds, the client MUST NOT retry automatically and MUST instead inform the user. | MUST |
| R2.39 | The client MUST NOT retry requests that received: HTTP 400 (Bad Request), HTTP 401 (Unauthorized), HTTP 403 (Forbidden), HTTP 404 (Not Found), or any JSON-RPC error with a non-transient A2A error code. These indicate logic errors, not transient failures. | MUST NOT |
| R2.40 | Each retry attempt MUST be logged to the audit log with: attempt number, delay applied, reason for retry. | MUST |

### 3.7 Request Timeouts

| ID | Requirement | Priority |
|----|------------|----------|
| R2.41 | Connection establishment timeout: 10 seconds. | MUST |
| R2.42 | Response header timeout (time to first byte): 30 seconds. | MUST |
| R2.43 | Response body read timeout: 60 seconds. | MUST |
| R2.44 | Total request timeout (inclusive of retries): 5 minutes. | MUST |
| R2.45 | All timeout values MUST be configurable via environment variables (`AGENTVERSE_CONNECT_TIMEOUT_MS`, `AGENTVERSE_RESPONSE_TIMEOUT_MS`, `AGENTVERSE_TOTAL_TIMEOUT_MS`) but MUST NOT be reducible below the defaults. | SHOULD |

---

## 4. R3 -- Agent Card Signing and Verification

### 4.1 JWS Implementation (RFC 7515)

| ID | Requirement | Priority |
|----|------------|----------|
| R3.1 | The client MUST use the `jose` npm library (v6.x) for all JWS operations. `jose` uses the Web Crypto API (native to Node.js), has zero dependencies, full TypeScript types, and supports all required algorithms. | MUST |
| R3.2 | The following JWS algorithms MUST be supported for Agent Card signature verification: `ES256` (ECDSA using P-256 curve and SHA-256), `EdDSA` (Ed25519). | MUST |
| R3.3 | The following JWS algorithms SHOULD be supported for verification: `ES384` (ECDSA using P-384 curve and SHA-384), `RS256` (RSASSA-PKCS1-v1_5 using SHA-256, minimum 2048-bit key). | SHOULD |
| R3.4 | The client MUST NOT support the `none` algorithm. Any Agent Card declaring `algorithm: "none"` MUST be rejected. | MUST NOT |
| R3.5 | The client MUST NOT support symmetric algorithms (HS256, HS384, HS512) for Agent Card verification. Only asymmetric algorithms are acceptable. | MUST NOT |
| R3.6 | For verification, the client MUST use the `jose` functions: `importJWK()` to import the public key from the DID Document, and the appropriate verify function (`compactVerify` for compact JWS, `flattenedVerify` for flattened JWS) depending on the serialization format used in the Agent Card's `signature` field. | MUST |

### 4.2 Signing the User's Own Agent Card

| ID | Requirement | Priority |
|----|------------|----------|
| R3.7 | The Agentverse client MUST generate its own Ed25519 key pair on first initialization using `jose.generateKeyPair('EdDSA', { crv: 'Ed25519' })`. | MUST |
| R3.8 | The private key MUST be stored at `~/.agentverse/keys/agent-private.jwk` with file permissions `0600` (owner read/write only). The file MUST contain the JWK representation of the private key exported via `jose.exportJWK()`. | MUST |
| R3.9 | The public key MUST be stored at `~/.agentverse/keys/agent-public.jwk` with file permissions `0644`. This file is used to construct the user's DID Document. | MUST |
| R3.10 | On every system where the CLI is installed, the key pair MUST be unique. Keys MUST NOT be copied between machines unless the user explicitly exports and imports them via `agentverse keys export` and `agentverse keys import`. | MUST |
| R3.11 | The client MUST provide `agentverse keys rotate` to generate a new key pair. The old key pair MUST be archived (not deleted) at `~/.agentverse/keys/archive/{timestamp}/` for a retention period of 90 days. | SHOULD |
| R3.12 | The Agentverse client MUST sign its own Agent Card using Compact JWS serialization with the `EdDSA` algorithm and the agent's private key. The JWS payload MUST be the deterministic canonical JSON of the Agent Card (sorted keys, no whitespace, `signature` field removed). | MUST |

### 4.3 `did:web` Resolution for Third-Party Agent Verification

| ID | Requirement | Priority |
|----|------------|----------|
| R3.13 | The client MUST resolve `did:web` identifiers to DID Documents following the W3C did:web method specification. The resolution MUST: (a) replace colons with forward slashes in the method-specific identifier, (b) percent-decode any encoded colons, (c) prepend `https://`, (d) append `/.well-known/did.json` if no path segments exist or `/did.json` to the path, (e) fetch via HTTPS GET. | MUST |
| R3.14 | The client MUST use the `did-resolver` npm package combined with the `web-did-resolver` package for did:web resolution. These provide a well-tested, TypeScript-native resolver pipeline. | MUST |
| R3.15 | The resolved DID Document MUST contain the `@context` field including `"https://www.w3.org/ns/did/v1"`. If `@context` is present, the document MUST be processed according to JSON-LD rules. If JSON-LD processing fails, the document MUST be rejected. | MUST |
| R3.16 | The resolved DID Document's `id` field MUST exactly match the queried DID. A mismatch MUST cause rejection with error: `"DID Document id mismatch: expected {queried_did}, got {document_id}."` | MUST |
| R3.17 | The client MUST extract the verification method referenced by the Agent Card's `signature.keyId` from the DID Document's `verificationMethod` array or `assertionMethod` array. The `keyId` MUST match a verification method `id` in the document. | MUST |
| R3.18 | The verification method MUST use a supported key type. For MVP, the supported types are: `JsonWebKey2020` (with JWK containing `kty: "OKP"`, `crv: "Ed25519"` for EdDSA, or `kty: "EC"`, `crv: "P-256"` for ES256), `Multikey` (with `publicKeyMultibase`). | MUST |
| R3.19 | All DID Document URLs within a `did:web` document MUST be absolute URLs. The client MUST reject documents containing relative URL references in verification method IDs. | MUST |
| R3.20 | DID Document resolution MUST use HTTPS only. The client MUST reject resolution URLs that do not use the `https://` scheme. | MUST |
| R3.21 | DID Document resolution MUST have the same timeout constraints as Agent Card fetching (R1.3): 10s connection, 30s read. | MUST |
| R3.22 | Resolved DID Documents MUST be cached locally at `~/.agentverse/cache/did-documents/` with a default TTL of 1 hour and a maximum TTL of 24 hours. The cache format and invalidation rules mirror those of Agent Card caching (R1.20-R1.26). | MUST |

### 4.4 End-to-End Verification Flow

| ID | Requirement | Priority |
|----|------------|----------|
| R3.23 | The complete Agent Card verification flow MUST execute in this order: (1) Fetch Agent Card, (2) Validate Agent Card schema (R1.9-R1.15), (3) Extract `signature` and `did` fields from the Agent Card, (4) Resolve the `did:web` identifier to a DID Document (R3.13-R3.22), (5) Extract the public key referenced by `signature.keyId` from the DID Document (R3.17-R3.18), (6) Verify the JWS signature on the canonical Agent Card using the extracted public key (R1.17, R3.6), (7) Check signature timestamp freshness (R1.19). A failure at any step MUST halt the flow and reject the Agent Card. | MUST |
| R3.24 | The entire verification flow (steps 1-7) MUST complete within 60 seconds total. If it exceeds this limit, the operation MUST timeout and fail. | MUST |
| R3.25 | Each step's success or failure MUST be logged at DEBUG level for diagnostic purposes. The final result (accept/reject) MUST be logged at INFO level. | MUST |

### 4.5 Recommended Library Stack

| Library | npm Package | Purpose | Version |
|---------|-------------|---------|---------|
| **jose** | `jose` | JWS signing/verification, JWK import/export, key generation | ^6.x |
| **did-resolver** | `did-resolver` | Pluggable DID resolution framework | latest |
| **web-did-resolver** | `web-did-resolver` | did:web method-specific resolver plugin | latest |
| **zod** | `zod` | Agent Card and DID Document schema validation | ^3.x |

---

## 5. R4 -- Consent Manager v1

### 5.1 YAML-Based Policy Files

| ID | Requirement | Priority |
|----|------------|----------|
| R4.1 | Consent policies MUST be stored as YAML files in `~/.agentverse/policies/`. Each file MUST be named `{agent-domain}.yaml` (e.g., `ditto.ai.yaml`). | MUST |
| R4.2 | A global default policy MUST exist at `~/.agentverse/policies/_default.yaml`. This file MUST be created on first initialization with a `deny-all` policy. | MUST |
| R4.3 | The policy file format MUST conform to the following schema: | MUST |

```yaml
# Policy schema v1
version: "1"
agent: "{did:web identifier or domain}"
created: "{ISO 8601 timestamp}"
updated: "{ISO 8601 timestamp}"

rules:
  - id: "{uuid}"
    purpose: "{declared purpose string}"
    decision: "allow" | "deny"
    attributes:
      allow:
        - "{attribute-name}"   # e.g., "interests", "age_range"
      deny:
        - "{attribute-name}"   # explicitly denied attributes
    predicates:                # optional, ZK proofs -- Phase 2
      - "{predicate expression}"
    constraints:
      expires: "{ISO 8601 timestamp or duration, e.g., 30d}"
      max_uses: {integer}      # maximum times this rule can be invoked
      uses_remaining: {integer} # decremented on each use
    auto_approve: false        # if true, skips interactive prompt
    created: "{ISO 8601 timestamp}"
```

| ID | Requirement | Priority |
|----|------------|----------|
| R4.4 | The default policy (`_default.yaml`) MUST contain a single rule with `decision: "deny"` and an empty `attributes.allow` list. This enforces the **default-deny** posture: nothing is shared without explicit consent. | MUST |
| R4.5 | Policy files MUST be validated against the policy schema (Zod) on load. Invalid policy files MUST cause the operation to fail with a descriptive error, not silently fall back to defaults. | MUST |
| R4.6 | Policy file permissions MUST be checked on load. If the file is world-readable (permissions allow group or other read on non-Windows systems), a warning MUST be displayed: `"Warning: Policy file {path} is readable by other users. Run 'chmod 600 {path}' to fix."` | SHOULD |

### 5.2 Interactive CLI Consent Prompts

| ID | Requirement | Priority |
|----|------------|----------|
| R4.7 | When no matching `allow` rule exists for a sharing request, the CLI MUST display an interactive consent prompt containing: (a) the agent's name (from Agent Card), (b) the agent's domain, (c) the agent's DID, (d) the agent's declared purpose, (e) the specific attributes being requested, (f) the agent's trust level (from progressive trust model), (g) the requested duration/expiry. | MUST |
| R4.8 | The consent prompt MUST clearly separate attributes into categories: `Will be shared` (attributes matching the request that are available), `Not available` (attributes requested but not in the user's profile), `Will NOT be shared` (attributes in the profile that are not being requested). | MUST |
| R4.9 | The prompt MUST offer the following options: `[y] Yes, share these attributes` -- creates an `allow` rule, `[n] No, deny this request` -- creates a `deny` rule, `[a] Always allow for this agent and purpose` -- creates an `allow` rule with `auto_approve: true`, `[d] Always deny for this agent` -- creates a `deny` rule for the agent across all purposes, `[?] Show more details` -- displays the full Agent Card and DID Document. | MUST |
| R4.10 | If the terminal is non-interactive (piped input, CI environment), the client MUST refuse to share and exit with a non-zero exit code and message: `"Consent required but terminal is non-interactive. Use a policy file or run interactively."` | MUST |

### 5.3 Audit Log

| ID | Requirement | Priority |
|----|------------|----------|
| R4.11 | All sharing events MUST be recorded in an append-only audit log at `~/.agentverse/audit/sharing.log`. | MUST |
| R4.12 | Each audit log entry MUST be a single JSON line (JSONL format) containing: `timestamp` (ISO 8601), `event_type` (one of: `consent_granted`, `consent_denied`, `data_shared`, `data_share_failed`, `agent_card_fetched`, `agent_card_rejected`, `task_created`, `task_completed`, `task_failed`, `task_canceled`, `policy_created`, `policy_updated`), `agent_domain` (string), `agent_did` (string), `purpose` (string), `attributes_disclosed` (array of strings, only for `data_shared` events), `task_id` (string, if applicable), `error` (string, if applicable), `request_id` (UUID of the JSON-RPC request). | MUST |
| R4.13 | The audit log MUST be append-only. The client MUST open the log file in append mode and MUST NOT truncate or overwrite existing entries. | MUST |
| R4.14 | The audit log file MUST have permissions `0600` (owner read/write only). | MUST |
| R4.15 | The audit log MUST be rotated when it exceeds 10 MB. Rotation MUST rename the current file to `sharing.log.{timestamp}` and create a new `sharing.log`. Rotated logs MUST be retained for 90 days. | SHOULD |
| R4.16 | The CLI MUST provide `agentverse audit show` to display recent audit log entries (default: last 50), with filtering by `--agent`, `--event-type`, `--since`, `--until`. | SHOULD |
| R4.17 | The CLI MUST provide `agentverse audit export --format json|csv` to export the full audit log. | SHOULD |

### 5.4 Default Deny Policy

| ID | Requirement | Priority |
|----|------------|----------|
| R4.18 | The system MUST operate under a **default-deny** posture at all times. If no explicit `allow` rule matches the current request (agent + purpose + attributes), the request MUST be denied or the interactive consent prompt MUST be triggered. | MUST |
| R4.19 | A `deny` rule MUST take precedence over an `allow` rule if both match. (Deny-overrides conflict resolution.) | MUST |
| R4.20 | If the `_default.yaml` file is missing or corrupted, the system MUST behave as if a `deny-all` policy is in effect. It MUST NOT default to allow. | MUST |

### 5.5 Pre-Authorized Policies

| ID | Requirement | Priority |
|----|------------|----------|
| R4.21 | Rules with `auto_approve: true` MUST skip the interactive consent prompt and proceed directly to VP generation and sending. | MUST |
| R4.22 | Pre-authorized rules MUST still be subject to constraint enforcement: if `expires` has passed, the rule MUST be treated as expired and the interactive prompt MUST be triggered. If `uses_remaining` is 0, the rule MUST be treated as exhausted. | MUST |
| R4.23 | Every invocation of a pre-authorized rule MUST still generate an audit log entry of type `data_shared` with all standard fields. The entry MUST include `auto_approved: true` to distinguish from interactive approvals. | MUST |
| R4.24 | The CLI MUST provide `agentverse policy list` to display all active policies, `agentverse policy show {agent-domain}` to display a specific agent's policy, and `agentverse policy revoke {agent-domain} [--rule-id {id}]` to revoke a specific rule or all rules for an agent. | SHOULD |
| R4.25 | Revoking a policy MUST NOT delete the policy file. It MUST set the rule's `decision` to `"deny"` and update the `updated` timestamp. The original `allow` decision MUST be preserved in an `original_decision` field for audit purposes. | MUST |

---

## 6. R5 -- MVP Security Baseline

### 6.1 HTTPS-Only Communication

| ID | Requirement | Priority |
|----|------------|----------|
| R5.1 | The client MUST reject all non-HTTPS URLs at the URL construction/validation layer, before any network request is made. This applies to: Agent Card endpoint URLs, A2A interface endpoint URLs, DID Document resolution URLs, any URL referenced in Agent Card fields. | MUST |
| R5.2 | The client MUST validate TLS certificates against the system's trusted CA store. Self-signed certificates MUST be rejected. There MUST be no `--insecure` or `NODE_TLS_REJECT_UNAUTHORIZED=0` escape hatch in the MVP. | MUST |
| R5.3 | The client MUST enforce a minimum TLS version of 1.2. Connections negotiating TLS 1.0 or 1.1 MUST be rejected. | MUST |
| R5.4 | TLS certificate hostname verification MUST be enforced. The certificate's Subject Alternative Name (SAN) MUST match the requested domain. | MUST |

### 6.2 Agent Card JWS Verification

| ID | Requirement | Priority |
|----|------------|----------|
| R5.5 | Unsigned Agent Cards MUST be rejected unconditionally. There is no "trust on first use" or "unsigned but known" exception in the MVP. | MUST |
| R5.6 | Agent Cards with invalid signatures (signature does not verify against the public key) MUST be rejected with a specific error message indicating the nature of the failure. | MUST |
| R5.7 | Agent Cards whose `signature.keyId` references a key not found in the resolved DID Document MUST be rejected. | MUST |
| R5.8 | Agent Cards signed with an algorithm not in the supported set (R3.2, R3.3) MUST be rejected. | MUST |

### 6.3 Structured Data Only

| ID | Requirement | Priority |
|----|------------|----------|
| R5.9 | The client MUST enforce a strict boundary between structured data (JSON in `DataPart`) and free-text content (`TextPart`). This is the primary prompt injection defense in the MVP. | MUST |
| R5.10 | Inbound `TextPart` content from third-party agents MUST be treated as untrusted display-only content. It MUST NOT be: concatenated with system prompts, passed as input to any LLM, used to modify control flow, used to construct URLs or file paths, used to influence consent decisions. | MUST |
| R5.11 | Inbound `DataPart` content MUST be validated against the expected JSON Schema before processing. Unexpected fields MUST be ignored (not rejected, for forward compatibility), but required fields missing from the schema MUST cause rejection. | MUST |
| R5.12 | The client MUST NOT render markdown, HTML, or any rich text format from inbound agent messages. All display to the user MUST be plain text. | MUST |

### 6.4 Rate Limiting on Outbound Requests

| ID | Requirement | Priority |
|----|------------|----------|
| R5.13 | The client MUST enforce per-domain rate limiting on outbound requests. Default limits: maximum 10 requests per minute per domain, maximum 100 requests per hour per domain. | MUST |
| R5.14 | Rate limit state MUST be maintained in memory (per CLI process lifetime) and MUST NOT persist across process restarts. | MUST |
| R5.15 | When a rate limit is hit, the client MUST refuse to send the request and display: `"Rate limit reached for {domain}. Maximum {limit} requests per {window}. Try again in {seconds}s."` | MUST |
| R5.16 | Rate limits MUST apply universally to all outbound requests (Agent Card fetches, SendMessage, GetTask, CancelTask). Localhost and loopback addresses MUST NOT be exempt. | MUST |

### 6.5 Local Audit Logging

| ID | Requirement | Priority |
|----|------------|----------|
| R5.17 | Every outbound A2A request (SendMessage, GetTask, CancelTask) MUST be logged with: timestamp, method, target domain, target DID, request ID, whether the request was auto-approved or interactively consented. | MUST |
| R5.18 | Every inbound A2A response MUST be logged with: timestamp, request ID (correlating to the outbound request), HTTP status code, task state, whether artifacts were present. The response body MUST NOT be logged (to avoid logging sensitive VP content in plaintext). | MUST |
| R5.19 | All security-relevant events MUST be logged: Agent Card signature verification pass/fail, DID Document resolution pass/fail, TLS certificate warnings, rate limit triggers, consent prompt results. | MUST |

### 6.6 Security Features Explicitly Deferred to Phase 2

| ID | Feature | Reason for Deferral |
|----|---------|---------------------|
| R5.20 | **End-to-end message encryption** (encrypting `DataPart` content with the recipient's public key) | Requires key exchange protocol design and agreement on encryption envelope format. TLS provides transport-level encryption for MVP. **Note:** Deferred after adversarial review found bare age encryption provides confidentiality but no sender authentication (Critical gap). Phase 2 will implement sign-then-encrypt via DIDComm v2 authcrypt. |
| R5.21 | **OAuth 2.0 / OpenID Connect flows** for agent authentication | MVP uses pre-shared bearer tokens or API keys. Full OAuth requires authorization server infrastructure. |
| R5.22 | **Mutual TLS (mTLS)** for client certificate authentication | Requires PKI infrastructure and certificate management. Bearer tokens suffice for MVP. |
| R5.23 | **CaMeL-style Dual LLM defense** (privileged/quarantined LLM split) | Requires significant architectural work (process isolation, capability enforcer). MVP mitigates by not processing `TextPart` and not exposing tools. |
| R5.24 | **Progressive trust level enforcement** (Level 0-4 access tiers) | MVP treats all verified agents equally (binary: verified or rejected). Trust tiers require interaction history tracking. |
| R5.25 | **Zero-knowledge predicate proofs** (Noir circuits for range proofs, set membership) | BBS+ selective disclosure covers MVP needs. ZKP circuits require Noir toolchain integration. |
| R5.26 | **Agent reputation system** (on-chain attestations, security audit verification) | Requires blockchain integration and attestation standard definition. |
| R5.27 | **Streaming and push notifications** (`SendStreamingMessage`, `SubscribeToTask`, webhook configuration) | Request-response is sufficient for MVP's profile sharing use case. |
| R5.28 | **Canary tokens** for data exfiltration detection | Requires unique marker generation and outbound content scanning infrastructure. |
| R5.29 | **Sandboxed execution** (gVisor/process isolation for quarantined processing) | MVP does not process untrusted content with an LLM, so sandboxing is not yet needed. |
| R5.30 | **Key rotation protocol** for DID key updates with continuity guarantees | MVP generates keys once and archives on rotation. Graceful rotation with overlap periods is Phase 2. |

---

## 7. R6 -- Edge Cases

### 6.1 Malformed Agent Cards

| ID | Requirement | Priority |
|----|------------|----------|
| R6.1 | If the Agent Card is not valid JSON (parse error), the client MUST reject it with: `"Agent Card from {domain} is not valid JSON: {parse_error_summary}."` | MUST |
| R6.2 | If the Agent Card is valid JSON but fails schema validation (R1.9-R1.15), the client MUST reject it with a message listing the specific validation errors: `"Agent Card from {domain} failed validation: {field}: {error}."` The client MUST list up to 5 validation errors. | MUST |
| R6.3 | If the Agent Card contains a `signature` field but the signature object itself is malformed (missing `algorithm`, missing `keyId`, `signature` value is not valid base64url), the client MUST reject it with: `"Agent Card from {domain} has a malformed signature: {specific_issue}."` | MUST |
| R6.4 | If the Agent Card declares skills with `inputSchema` or `outputSchema` fields that are not valid JSON Schema, the client MUST log a warning but MUST NOT reject the card (the schemas are informational, not security-critical). | SHOULD |
| R6.5 | If the Agent Card contains no `interfaces` entries with `type: "json-rpc"`, the client MUST reject it with: `"Agent at {domain} does not support JSON-RPC. Supported types: {list_of_types_found}."` | MUST |
| R6.6 | If the Agent Card JSON exceeds the 1 MB size limit (R1.14), the client MUST abort the download and reject with: `"Agent Card from {domain} exceeds maximum size (1 MB). This may indicate a malicious endpoint."` | MUST |

### 6.2 Expired or Revoked DID Documents

| ID | Requirement | Priority |
|----|------------|----------|
| R6.7 | If the DID Document endpoint returns HTTP 404, the client MUST treat the DID as deactivated/revoked and reject the Agent Card: `"DID {did} appears to be deactivated (DID Document not found at {url})."` | MUST |
| R6.8 | If the DID Document endpoint returns HTTP 410 (Gone), the client MUST treat the DID as permanently revoked and reject the Agent Card. If a cached DID Document exists, it MUST be purged. | MUST |
| R6.9 | If the DID Document contains a `deactivated: true` field (per DID Core spec), the client MUST reject the Agent Card: `"DID {did} has been deactivated by its controller."` | MUST |
| R6.10 | If the DID Document's verification method contains key material that has an `expires` property (non-standard but used by some implementations), and the expiry has passed, the client MUST reject the key and attempt to use alternative verification methods in the document. If no valid (non-expired) key matches the `signature.keyId`, the Agent Card MUST be rejected. | SHOULD |
| R6.11 | The client MUST NOT implement DID Document versioning or history resolution in the MVP. Only the current DID Document is fetched and used. Historical versions are deferred to Phase 2. | MUST NOT |

### 6.3 Network Partitions During Multi-Step Flows

| ID | Requirement | Priority |
|----|------------|----------|
| R6.12 | If a network failure occurs after a `SendMessage` has been sent but before a response is received, the client MUST NOT assume the message was not delivered. The client MUST: (a) log the failure, (b) attempt a `GetTask` call (if a `taskId` was included in the request) to determine whether the task was created, (c) if `GetTask` also fails, inform the user: `"Network error during communication with {domain}. The request may or may not have been received. Check 'agentverse audit show' for details."` | MUST |
| R6.13 | If a network failure occurs during task polling (`GetTask` calls for a `pending`/`working` task), the client MUST retry according to the retry policy (R2.35-R2.40). If all retries are exhausted, the client MUST inform the user that the task status is unknown and provide the task ID for manual follow-up: `"Lost contact with {domain} during task {task_id}. You can check status later with 'agentverse task status {task_id} --agent {domain}'."` | MUST |
| R6.14 | The client MUST NOT re-send a `SendMessage` containing a VP if the original request's delivery status is unknown. Re-sending a VP could result in duplicate data disclosure. The user MUST explicitly confirm re-send: `"The previous VP delivery to {domain} is uncertain. Re-send the Verifiable Presentation? [y/N]"` Default MUST be No. | MUST |
| R6.15 | If the client is interrupted (Ctrl+C, SIGTERM, process kill) during an active multi-step flow, the client MUST persist the in-progress task state to `~/.agentverse/state/pending-tasks.json` so that the user can resume or check status on the next CLI invocation. | SHOULD |

### 6.4 Clock Skew Between Agents

| ID | Requirement | Priority |
|----|------------|----------|
| R6.16 | The client MUST tolerate a clock skew of up to 5 minutes (300 seconds) when validating Agent Card signature timestamps. A signature timestamp that is up to 5 minutes in the future MUST NOT be rejected solely for being in the future. | MUST |
| R6.17 | The client MUST tolerate a clock skew of up to 5 minutes when validating `TaskStatus.stateUpdatedAt` timestamps. Task timestamps slightly in the future MUST NOT cause processing errors. | MUST |
| R6.18 | The client MUST use monotonic clocks (not wall clocks) for timeout calculations to avoid issues with system time adjustments during operations. | MUST |
| R6.19 | All timestamps generated by the client (audit log entries, policy `created`/`updated` fields, VP `issuanceDate`) MUST be in UTC (ISO 8601 with `Z` suffix). The client MUST NOT use local time zones in any persisted data. | MUST |

### 6.5 Agent Card Changes Between Discovery and Message Send

| ID | Requirement | Priority |
|----|------------|----------|
| R6.20 | The client MUST record the Agent Card's content hash (SHA-256 of the canonical JSON) at discovery time. Before sending a `SendMessage`, if the cached Agent Card's TTL has expired, the client MUST re-fetch and re-verify the Agent Card. | MUST |
| R6.21 | If the re-fetched Agent Card differs from the cached version (different content hash), the client MUST: (a) re-validate the schema and signature, (b) compare the `interfaces[].url` endpoint -- if the endpoint URL has changed, the user MUST be warned: `"Agent Card for {domain} has changed since discovery. The endpoint URL is now {new_url} (was {old_url}). Continue? [y/N]"`, (c) compare the `securitySchemes` -- if authentication requirements have changed, the user MUST be warned, (d) compare the `skills` list -- changes to skills SHOULD be logged but do not require user confirmation. | MUST |
| R6.22 | If the re-fetched Agent Card is now unsigned (previously was signed), the client MUST reject it unconditionally. This is a potential downgrade attack. | MUST |
| R6.23 | If the re-fetched Agent Card has a different `did` than the previously cached version, the client MUST reject it and warn the user: `"SECURITY WARNING: Agent Card for {domain} now claims DID {new_did} (previously {old_did}). This may indicate a compromise. The request has been aborted."` This MUST be logged as a security event in the audit log. | MUST |
| R6.24 | If the Agent Card endpoint becomes unreachable between discovery and send (TTL expired, re-fetch fails), the client MUST NOT use the stale cached card for first-time interactions. For previously trusted agents (existing policy with `auto_approve: true`), the client MAY proceed with the cached card if the cache age is less than 4 hours, with a warning logged. | MUST |

### 6.6 Additional Edge Cases

| ID | Requirement | Priority |
|----|------------|----------|
| R6.25 | If the Agent Card's `interfaces[].url` points to a private IP address (10.x.x.x, 172.16-31.x.x, 192.168.x.x) or loopback (127.0.0.1, ::1), the client MUST reject it: `"Agent Card for {domain} declares a private/loopback endpoint URL. This is not allowed for remote agents."` This prevents SSRF attacks. | MUST |
| R6.26 | If the Agent Card's `interfaces[].url` uses a non-standard port, the client MUST allow it but log a warning. Ports below 1024 (except 443) SHOULD be treated with caution. | SHOULD |
| R6.27 | If the DID Document resolution encounters an infinite redirect loop (more than 5 redirects), the client MUST abort and reject. | MUST |
| R6.28 | If the resolved DID Document is excessively large (over 256 KB), the client MUST reject it to prevent resource exhaustion. | MUST |
| R6.29 | If the system clock is detected as significantly incorrect (e.g., TLS certificate `notBefore` is in the future), the client SHOULD warn the user: `"Warning: System clock may be incorrect. This can cause certificate and timestamp validation failures."` | SHOULD |
| R6.30 | If `~/.agentverse/` directory does not exist on first run, the client MUST create it with permissions `0700` and initialize all required subdirectories (`keys/`, `policies/`, `cache/agent-cards/`, `cache/did-documents/`, `audit/`, `state/`). | MUST |

---

## Appendix A: Technology Selection Rationale

### A.1 `jose` (v6.x) for JWS Operations

**Selected over**: `jsonwebtoken`, `node-jose`, `@panva/jose`

**Rationale**:
- Zero dependencies (minimizes supply chain risk)
- Uses Web Crypto API natively (Node.js built-in, no native addons)
- Full TypeScript type definitions included
- Supports all required algorithms: ES256, EdDSA (Ed25519), RS256, ES384
- Provides both Compact and JSON JWS serialization
- Key management functions: `importJWK`, `exportJWK`, `generateKeyPair`, `importSPKI`
- Works across Node.js, Deno, Bun, and browser runtimes (future-proofing)
- Actively maintained (v6.x released March 2026, 246 releases total)
- `jsonwebtoken` uses older Node.js crypto APIs, has dependencies, and limited algorithm support
- `node-jose` is heavier and less actively maintained

### A.2 `did-resolver` + `web-did-resolver` for DID Resolution

**Selected over**: custom HTTP-based resolution, `@veramo/did-resolver`

**Rationale**:
- `did-resolver` provides a pluggable resolver framework supporting multiple DID methods
- `web-did-resolver` is the reference implementation for `did:web` resolution
- TypeScript-native (75% TypeScript codebase)
- Handles URL construction from DID identifiers (colon-to-slash conversion, `.well-known` path logic)
- Maintained by the Decentralized Identity Foundation
- `@veramo/did-resolver` is heavier and bundles unnecessary DID methods
- Custom resolution would duplicate well-tested URL construction logic

### A.3 `zod` (v3.x) for Schema Validation

**Selected over**: `ajv`, `joi`, `yup`

**Rationale**:
- TypeScript-first design with automatic type inference from schemas
- Composable schemas mirror the A2A type hierarchy (AgentCard, AgentSkill, etc.)
- Zero dependencies
- Excellent error messages with path-aware validation
- Already used for Profile Extractor schemas (consistency across codebase)

### A.4 HTTP Client: Node.js Built-in `fetch` (via `undici`)

**Selected over**: `axios`, `got`, `node-fetch`

**Rationale**:
- Built into Node.js 18+ (no additional dependency)
- Supports AbortController for timeout management
- Handles redirects natively
- Undici provides connection pooling and HTTP/2 support
- `axios` adds unnecessary dependency weight for simple GET/POST operations

---

## Appendix B: Deferred to Phase 2

The following capabilities are explicitly out of scope for the MVP but are documented here to ensure the MVP architecture does not preclude their implementation.

| Capability | Phase 2 Requirement | MVP Architecture Consideration |
|-----------|---------------------|-------------------------------|
| Streaming (SSE) | Support `SendStreamingMessage` and `SubscribeToTask` | The A2A client module MUST be structured to allow adding streaming transport alongside request-response. Method dispatch MUST be extensible. |
| Push Notifications | Support `CreateTaskPushNotificationConfig` and webhook delivery | The task management module MUST support async completion callbacks. |
| OAuth 2.0 Flows | Support `authorizationCode`, `clientCredentials`, and `deviceCode` flows | The `securitySchemes` parser MUST already recognize OAuth2 scheme types and store them, even though the MVP only acts on `apiKey` and `http` bearer schemes. |
| Extended Agent Cards | Support `GetExtendedAgentCard` for authenticated card retrieval | The Agent Card fetcher MUST be extensible to support authenticated requests. |
| gRPC Transport | Support `type: "grpc"` interfaces | The interface selection logic MUST gracefully skip non-JSON-RPC interfaces (already required by R1.11). |
| Pagination | Support `pageToken`/`nextPageToken` in `ListTasks` | Not applicable to MVP (no task listing needed). |
| End-to-End Encryption | Encrypt `DataPart` payloads with recipient public key | The message construction pipeline MUST have a clear pre-send hook point where encryption can be injected. |
| Dual LLM Defense | CaMeL-style privileged/quarantined processing | The response processing pipeline MUST separate "extract structured data" from "act on data" into distinct functions. |
| Trust Tiers | Progressive trust Level 0-4 enforcement | The trust check MUST be a single function (`evaluateTrust(agentDid): TrustLevel`) that MVP implements as binary (verified=Level 1, else=Level 0) but Phase 2 extends to full tiers. |

---

## Appendix C: References

| Reference | URL |
|-----------|-----|
| A2A Protocol Specification v1.0 | https://a2a-protocol.org/latest/specification/ |
| A2A GitHub Repository | https://github.com/a2aproject/A2A |
| did:web Method Specification | https://w3c-ccg.github.io/did-method-web/ |
| W3C DID Core 1.0 | https://www.w3.org/TR/did-core/ |
| W3C VC Data Model 2.0 | https://www.w3.org/TR/vc-data-model-2.0/ |
| RFC 7515 (JWS) | https://datatracker.ietf.org/doc/html/rfc7515 |
| RFC 7517 (JWK) | https://datatracker.ietf.org/doc/html/rfc7517 |
| RFC 7518 (JWA) | https://datatracker.ietf.org/doc/html/rfc7518 |
| jose npm library | https://github.com/panva/jose |
| did-resolver npm | https://github.com/decentralized-identity/did-resolver |
| web-did-resolver npm | https://github.com/decentralized-identity/web-did-resolver |
| Agentverse Research Report | ./RESEARCH_REPORT.md |
| JSON-RPC 2.0 Specification | https://www.jsonrpc.org/specification |
| RFC 2119 (Key Words) | https://datatracker.ietf.org/doc/html/rfc2119 |
