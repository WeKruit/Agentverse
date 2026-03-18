/**
 * Types for the discovery and matching system.
 */

import { z } from "zod";

/**
 * A bucket is a purpose-specific namespace where distilled agents
 * are submitted for matching. Buckets enable cross-venue matching.
 */
export const BucketSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.enum([
    "recruiting", "dating", "cofounder", "freelance",
    "collaboration", "networking", "custom",
  ]),
  schema_fields: z.array(z.string()), // required structured fields
  status: z.enum(["active", "stale", "archived"]).default("active"),
  agent_count: z.number().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Bucket = z.infer<typeof BucketSchema>;

/**
 * A distilled agent listing within a bucket.
 * Contains only exchange info (no PII).
 */
export const AgentListingSchema = z.object({
  id: z.string(),
  bucket_id: z.string(),
  owner_did: z.string(), // ephemeral did:jwk (unlinkable to real identity)
  structured: z.record(z.any()), // Tier 1 enum-only fields
  evaluable_text: z.record(z.string()).optional(), // Tier 2 free text
  embedding: z.array(z.number()).optional(), // 384-dim vector for HNSW
  dealbreakers: z.array(z.object({
    field: z.string(),
    operator: z.enum(["eq", "neq", "in", "not_in", "gte", "lte"]),
    value: z.any(),
  })).optional(),
  status: z.enum(["active", "pending_match", "matched", "expired", "withdrawn"]).default("active"),
  created_at: z.string(),
  expires_at: z.string(),
  commitment_hash: z.string().optional(), // SHA-256 hash for commit-then-reveal
});

export type AgentListing = z.infer<typeof AgentListingSchema>;

/**
 * A match result from the matching engine.
 */
export interface MatchResult {
  listing_a_id: string;
  listing_b_id: string;
  signal: "strong" | "good" | "possible" | "weak";
  matched_on: string[];
  gaps: string[];
  score: number; // 0-1, for internal ranking only
  mutual: boolean; // both passed each other's dealbreakers
}

/**
 * A match proposal shown to the user.
 */
export interface MatchProposal {
  id: string;
  bucket_id: string;
  owner_listing_id: string; // who this proposal belongs to
  owner_name: string; // human-readable name of the owner
  owner_did: string;
  peer_listing_id: string; // who they matched with
  peer_name: string; // human-readable name of the peer
  peer_did: string;
  signal: "strong" | "good" | "possible" | "weak";
  matched_on: string[];
  gaps: string[];
  peer_structured: Record<string, any>; // their Tier 1 data
  peer_evaluable_text?: Record<string, string>; // their Tier 2 data (post-score reveal)
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  expires_at: string;
}

/**
 * Venue configuration for operating a matching service.
 */
export interface VenueConfig {
  name: string;
  operator_did: string;
  buckets: string[]; // bucket IDs this venue serves
  matching_config: {
    min_score_for_proposal: number; // minimum score to generate a match proposal (0-1)
    max_proposals_per_agent: number; // limit proposals to prevent spam
    require_mutual_dealbreakers: boolean; // both must pass each other's constraints
  };
}
