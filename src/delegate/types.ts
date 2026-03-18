/**
 * Types for the delegate agent system.
 *
 * The delegate model: Main agent spawns ephemeral delegates with scoped
 * read-only "filesystems." Both delegates' filesystems are mutually visible.
 * Each delegate's LLM reads the other's filesystem, scores compatibility,
 * and reports to its own human.
 */

import { z } from "zod";

/**
 * Three-tier filesystem — the core data model for delegate evaluation.
 *
 * Tier 1 (structured): Enum-only values from fixed taxonomies. Safe for LLM scoring.
 * Tier 2 (evaluable_text): Free text that IS the signal. Processed through defense stack.
 * Tier 3 (human_only): Free text for human eyes only. Never touched by any LLM.
 */
export const DelegateFilesystemSchema = z.object({
  // Metadata
  purpose: z.string(),
  created_at: z.string(),
  expires_at: z.string().optional(),
  owner_did: z.string(),

  // Tier 1: Structured — enum-only, safe for LLM scoring
  structured: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ])),

  // Tier 2: Evaluable text — free text processed through defense stack before LLM scoring
  evaluable_text: z.record(z.string()).optional(),

  // Tier 3: Human-only — shown to human post-match, never processed by any LLM
  human_only: z.record(z.string()).optional(),
});

export type DelegateFilesystem = z.infer<typeof DelegateFilesystemSchema>;

/**
 * Scoring output — coarse signal, not precise numbers.
 */
export const ScoringResultSchema = z.object({
  signal: z.enum(["strong", "good", "possible", "weak"]),
  matched_on: z.array(z.string()),
  gaps: z.array(z.string()),
  score_details: z.record(z.number()).optional(), // per-dimension scores (0-1)
  recommend_escalate: z.boolean(),
  summary: z.string().max(500),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/**
 * Contact request — structured message for direct contact mode.
 */
export const ContactRequestSchema = z.object({
  type: z.literal("contact_request"),
  from_did: z.string(),
  from_name: z.string().optional(),
  purpose: z.enum([
    "recruiting", "collaboration", "cofounder",
    "networking", "referral", "freelance", "other",
  ]),
  message_summary: z.string().max(200),
  requested_topics: z.array(z.string()),
  credential: z.any().optional(), // BBS+ VP proving sender identity
  referral_token: z.any().optional(), // BBS+ VP from a mutual connection
});

export type ContactRequest = z.infer<typeof ContactRequestSchema>;

/**
 * Contact request triage result.
 */
export interface TriageResult {
  action: "approve" | "deny" | "prompt";
  reason: string;
  trust_level: "unknown" | "known" | "verified" | "trusted";
  matched_policy?: string;
}

/**
 * Delegate instance — represents an active delegate agent.
 */
export interface DelegateInstance {
  id: string;
  purpose: string;
  peer_did: string;
  peer_name?: string;
  filesystem: DelegateFilesystem;
  created_at: string;
  status: "active" | "scored" | "escalated" | "completed" | "expired";
  scoring_result?: ScoringResult;
}

/**
 * Relationship record — structured persistence for ongoing connections.
 */
export const RelationshipRecordSchema = z.object({
  peer_did: z.string(),
  peer_name: z.string().optional(),
  purpose: z.string(),
  status: z.enum(["pending", "active", "paused", "ended"]),
  preset: z.array(z.string()), // attributes shared in this relationship
  interactions: z.number().default(0),
  topics_discussed: z.array(z.string()).default([]),
  trust_level: z.enum(["unknown", "known", "verified", "trusted"]).default("unknown"),
  created_at: z.string(),
  last_interaction: z.string(),
  notes: z.string().optional(), // structured summary, never raw conversation
});

export type RelationshipRecord = z.infer<typeof RelationshipRecordSchema>;

/**
 * Referral token claims — what goes inside a BBS+ VP for introductions.
 */
export const ReferralClaimsSchema = z.object({
  referee_did: z.string(),
  target_did: z.string(),
  purpose: z.string(),
  vouching_level: z.enum([
    "acquaintance", "professional-acquaintance",
    "colleague", "close-colleague", "trusted",
  ]),
  message: z.string().max(200).optional(),
  expires_at: z.string(),
});

export type ReferralClaims = z.infer<typeof ReferralClaimsSchema>;

/**
 * Direct contact policy — who can contact us for what.
 */
export const DirectContactPolicySchema = z.object({
  default_action: z.enum(["deny", "prompt"]).default("deny"),
  rate_limits: z.object({
    per_sender_per_hour: z.number().default(3),
    total_per_day: z.number().default(30),
  }).optional(),
  purposes: z.record(z.object({
    action: z.enum(["allow", "deny", "prompt"]),
    allowed_topics: z.array(z.string()).optional(),
    auto_approve_if: z.object({
      trust_level: z.string().optional(),
      has_credential: z.string().optional(),
      has_referral: z.boolean().optional(),
    }).optional(),
    require_credential: z.string().optional(),
  })).optional(),
});

export type DirectContactPolicy = z.infer<typeof DirectContactPolicySchema>;
