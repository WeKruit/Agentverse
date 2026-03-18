/**
 * Agentverse SDK — clean interface for third-party integration.
 *
 * Provides a high-level API for:
 * - Building agent profiles
 * - Issuing and verifying credentials
 * - Submitting to buckets and managing matches
 * - Running a venue
 *
 * This is what external developers import to integrate with Agentverse.
 */

// Re-export all public types
export type { ExtractedProfile, SkillEntry, InterestEntry } from "../extractor/types.js";
export type { DelegateFilesystem, ScoringResult, ContactRequest, RelationshipRecord, ReferralClaims } from "../delegate/types.js";
export type { AgentCard } from "../a2a/types.js";
export type { AgentListing, Bucket, MatchResult, MatchProposal, VenueConfig } from "../discovery/types.js";
export type { ReputationScore, AgentMetrics } from "./reputation.js";
export type { MatchToken } from "./match-tokens.js";
export type { DataExport } from "./gdpr.js";

// Re-export key functions organized by domain

// === Profile ===
export { parseClaudeCodeFile, findClaudeCodeFiles } from "../extractor/claude-code-parser.js";
export { parseChatGPTFile } from "../extractor/chatgpt-parser.js";
export { extractProfile } from "../extractor/pipeline.js";
export { redact } from "../extractor/redaction.js";

// === Wallet ===
export { generateMasterKeyPair, importKeyPair, encryptData, decryptData, createDidDocument } from "../wallet/keys.js";
export { issueCredential, verifyCredential } from "../wallet/credentials.js";
export { generatePresentation, verifyPresentation, PRESETS } from "../wallet/presentation.js";
export { initializeDirectory, encryptAndStore, readAndDecrypt, isWalletInitialized } from "../wallet/storage.js";

// === A2A ===
export { fetchAgentCard, validateAgentCard } from "../a2a/agent-card.js";
export { sendVP } from "../a2a/client.js";

// === Consent ===
export { loadPolicy, savePolicy, evaluatePolicy, addRule, promptConsent } from "../consent/manager.js";
export { logSharingEvent, readAuditLog, verifyAuditChain } from "../consent/audit.js";

// === Delegates ===
export { buildFilesystem, isExpired, getStructuredFields } from "../delegate/filesystem.js";
export { spawnDelegate, scoreCompatibility, destroyDelegate, listActiveDelegates } from "../delegate/lifecycle.js";
export { triageContactRequest } from "../delegate/contact-handler.js";
export { saveRelationship, loadRelationship, listRelationships, createRelationshipFromMatch } from "../delegate/relationships.js";
export { issueReferralToken, verifyReferralToken } from "../delegate/referrals.js";
export { signThenEncrypt, decryptThenVerify, generateSigningKeyPair, generateEncryptionKeyPair } from "../delegate/sign-then-encrypt.js";
export { startDoorbellServer } from "../delegate/doorbell-server.js";

// === Discovery ===
export { initializeRegistry, createBucket, listBuckets, submitAgent, getActiveListings } from "../discovery/bucket-registry.js";
export { findMatches } from "../discovery/matching-engine.js";
export { createMatchProposals, acceptProposal, declineProposal, getPendingProposals } from "../discovery/match-protocol.js";
export { SimulatedTeeVenue, createLocalVenue } from "../discovery/venue.js";
export { generateLocalEmbedding, cosineSimilarity } from "../discovery/embeddings.js";

// === Ecosystem ===
export { computeReputation, recordProposal, recordAcceptance, recordCompletion, recordReferral, detectAnomalies } from "./reputation.js";
export { generateMatchToken, verifyParticipation, saveMatchToken, loadMatchTokens } from "./match-tokens.js";
export { exportAllData, saveExport, revokeVP, eraseAllData } from "./gdpr.js";

// === Server ===
export { startLocalServer } from "../local-server/api.js";
export { startMockAgent } from "../mock-agent/server.js";
