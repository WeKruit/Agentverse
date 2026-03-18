/**
 * Post-match protocol — anonymous introduction, reveal flow, and identity exchange.
 *
 * After the matching engine produces match proposals, this module handles:
 * 1. Creating match proposals for both parties
 * 2. Anonymous introduction (neither knows who the other is yet)
 * 3. Mutual accept/decline
 * 4. human_readable reveal (Tier 2 text shown to human)
 * 5. Identity reveal (BBS+ selective disclosure of Tier 3-4)
 */

import * as crypto from "node:crypto";
import type { AgentListing, MatchResult, MatchProposal } from "./types.js";

/** In-memory proposal storage (production: database). */
const proposals = new Map<string, MatchProposal>();

/**
 * Create match proposals for both parties from a match result.
 * Each party sees the other's structured data but not their identity.
 */
export function createMatchProposals(
  result: MatchResult,
  listingA: AgentListing,
  listingB: AgentListing,
  expiryHours: number = 48
): { proposalForA: MatchProposal; proposalForB: MatchProposal } {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryHours * 3600000).toISOString();

  const proposalForA: MatchProposal = {
    id: `match-${crypto.randomUUID().slice(0, 8)}`,
    bucket_id: listingA.bucket_id,
    peer_listing_id: listingB.id,
    signal: result.signal,
    matched_on: result.matched_on,
    gaps: result.gaps,
    peer_structured: listingB.structured,
    peer_evaluable_text: listingB.evaluable_text,
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expiresAt,
  };

  const proposalForB: MatchProposal = {
    id: `match-${crypto.randomUUID().slice(0, 8)}`,
    bucket_id: listingB.bucket_id,
    peer_listing_id: listingA.id,
    signal: result.signal,
    matched_on: result.matched_on,
    gaps: result.gaps,
    peer_structured: listingA.structured,
    peer_evaluable_text: listingA.evaluable_text,
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expiresAt,
  };

  proposals.set(proposalForA.id, proposalForA);
  proposals.set(proposalForB.id, proposalForB);

  return { proposalForA, proposalForB };
}

/**
 * Accept a match proposal.
 */
export function acceptProposal(proposalId: string): MatchProposal | null {
  const proposal = proposals.get(proposalId);
  if (!proposal) return null;
  if (proposal.status !== "pending") return null;

  // Check expiry
  if (new Date(proposal.expires_at).getTime() < Date.now()) {
    proposal.status = "expired";
    return null;
  }

  proposal.status = "accepted";
  return proposal;
}

/**
 * Decline a match proposal.
 */
export function declineProposal(proposalId: string): boolean {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.status !== "pending") return false;

  proposal.status = "declined";
  return true;
}

/**
 * Get a proposal by ID.
 */
export function getProposal(proposalId: string): MatchProposal | undefined {
  return proposals.get(proposalId);
}

/**
 * List all proposals for a listing (by peer_listing_id lookup — reverse search).
 */
export function getProposalsForListing(listingId: string): MatchProposal[] {
  return Array.from(proposals.values()).filter(
    (p) => p.peer_listing_id === listingId || p.id.includes(listingId)
  );
}

/**
 * List all pending proposals.
 */
export function getPendingProposals(): MatchProposal[] {
  const now = Date.now();
  return Array.from(proposals.values()).filter((p) => {
    if (p.status !== "pending") return false;
    if (new Date(p.expires_at).getTime() < now) {
      p.status = "expired";
      return false;
    }
    return true;
  });
}

/**
 * Check if both parties have accepted (mutual match).
 * Returns the pair of proposal IDs if both accepted, null otherwise.
 */
export function checkMutualAccept(
  proposalIdA: string,
  proposalIdB: string
): boolean {
  const a = proposals.get(proposalIdA);
  const b = proposals.get(proposalIdB);

  return !!(a && b && a.status === "accepted" && b.status === "accepted");
}

/**
 * Format a match proposal for CLI display.
 */
export function formatMatchProposal(proposal: MatchProposal): string {
  const lines = [
    "",
    `  Match Proposal: ${proposal.id}`,
    `  Signal: ${proposal.signal.toUpperCase()}`,
    `  Bucket: ${proposal.bucket_id}`,
    "",
    `  Matched on:`,
    ...proposal.matched_on.map((m) => `    + ${m}`),
  ];

  if (proposal.gaps.length > 0) {
    lines.push("", "  Gaps:");
    lines.push(...proposal.gaps.map((g) => `    - ${g}`));
  }

  lines.push(
    "",
    "  Peer profile (structured):",
    ...Object.entries(proposal.peer_structured).map(
      ([k, v]) => `    ${k}: ${Array.isArray(v) ? v.join(", ") : v}`
    )
  );

  if (proposal.peer_evaluable_text) {
    lines.push("", "  Peer description:");
    for (const [key, text] of Object.entries(proposal.peer_evaluable_text)) {
      lines.push(`    ${key}: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`);
    }
  }

  lines.push(
    "",
    `  Expires: ${proposal.expires_at}`,
    "",
    "  [y] Accept  [n] Decline",
    ""
  );

  return lines.join("\n");
}

/**
 * Clear all proposals (for testing).
 */
export function clearProposals(): void {
  proposals.clear();
}
