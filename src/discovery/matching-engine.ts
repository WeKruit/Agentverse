/**
 * Matching engine — runs inside a simulated TEE for local development.
 *
 * Three-phase matching pipeline:
 * 1. Pre-filter: inverted index over structured fields (<5ms)
 * 2. Similarity: cosine similarity on embeddings or field overlap (10-30ms)
 * 3. PSI eligibility: mutual dealbreaker checking
 *
 * In production, phases 2-3 run inside a Nitro Enclave.
 * Locally, they run in-process with the same interface.
 */

import type { AgentListing, MatchResult } from "./types.js";

/**
 * Run the full matching pipeline for a new listing against all active listings.
 *
 * @param newListing - The newly submitted agent listing
 * @param existingListings - All active listings in the bucket
 * @param minScore - Minimum score to include in results (0-1)
 * @returns Sorted array of match results (best first)
 */
export function findMatches(
  newListing: AgentListing,
  existingListings: AgentListing[],
  minScore: number = 0.3
): MatchResult[] {
  // Exclude self-matches
  const candidates = existingListings.filter(
    (l) => l.id !== newListing.id && l.owner_did !== newListing.owner_did
  );

  if (candidates.length === 0) return [];

  // Phase 1: Pre-filter — eliminate candidates that share no fields
  const preFiltered = preFilter(newListing, candidates);

  // Phase 2: Score — compute similarity for remaining candidates
  const scored = preFiltered.map((candidate) => ({
    candidate,
    ...computeScore(newListing, candidate),
  }));

  // Phase 3: PSI — check mutual dealbreakers
  const results: MatchResult[] = scored
    .filter((s) => s.score >= minScore)
    .map((s) => {
      const mutual = checkMutualDealbreakers(newListing, s.candidate);
      return {
        listing_a_id: newListing.id,
        listing_b_id: s.candidate.id,
        signal: scoreToSignal(s.score),
        matched_on: s.matched_on,
        gaps: s.gaps,
        score: s.score,
        mutual,
      };
    })
    .filter((r) => r.mutual) // Only include mutual matches
    .sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Phase 1: Pre-filter using inverted index logic.
 * Eliminates candidates that share zero structured fields.
 */
function preFilter(
  newListing: AgentListing,
  candidates: AgentListing[]
): AgentListing[] {
  const ourFields = new Set(Object.keys(newListing.structured));

  return candidates.filter((candidate) => {
    const theirFields = Object.keys(candidate.structured);
    return theirFields.some((f) => ourFields.has(f));
  });
}

/**
 * Phase 2: Compute similarity score.
 *
 * Uses embedding cosine similarity if available, otherwise falls back
 * to structured field overlap scoring.
 */
function computeScore(
  a: AgentListing,
  b: AgentListing
): { score: number; matched_on: string[]; gaps: string[] } {
  // Try embedding similarity first
  if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
    const cosineSim = cosineSimilarity(a.embedding, b.embedding);
    const fieldResult = fieldOverlapScore(a.structured, b.structured);

    // Weighted: 60% embedding + 40% field overlap
    return {
      score: cosineSim * 0.6 + fieldResult.score * 0.4,
      matched_on: fieldResult.matched_on,
      gaps: fieldResult.gaps,
    };
  }

  // Fallback: field overlap only
  return fieldOverlapScore(a.structured, b.structured);
}

/**
 * Compute field overlap score between two structured profiles.
 */
function fieldOverlapScore(
  a: Record<string, any>,
  b: Record<string, any>
): { score: number; matched_on: string[]; gaps: string[] } {
  const matched_on: string[] = [];
  const gaps: string[] = [];
  let totalScore = 0;
  let dimensions = 0;

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const aVal = a[key];
    const bVal = b[key];

    // Skip dealbreaker prefix fields (min_, max_, etc.)
    if (key.startsWith("min_") || key.startsWith("max_") ||
        key.startsWith("required_") || key.startsWith("excluded_")) {
      continue;
    }

    if (aVal === undefined || bVal === undefined) continue;

    dimensions++;

    if (Array.isArray(aVal) && Array.isArray(bVal)) {
      const aSet = new Set(aVal.map(String));
      const bSet = new Set(bVal.map(String));
      const overlap = [...aSet].filter((v) => bSet.has(v));

      if (overlap.length > 0) {
        const similarity = overlap.length / Math.max(aSet.size, bSet.size);
        matched_on.push(`${key}: ${overlap.join(", ")}`);
        totalScore += similarity;
      } else {
        gaps.push(`No overlap on ${key}`);
      }
    } else if (String(aVal) === String(bVal)) {
      matched_on.push(`${key}: ${aVal}`);
      totalScore += 1;
    } else {
      gaps.push(`${key}: "${aVal}" vs "${bVal}"`);
      totalScore += 0.2; // partial credit for having the field
    }
  }

  return {
    score: dimensions > 0 ? totalScore / dimensions : 0,
    matched_on,
    gaps,
  };
}

/**
 * Phase 3: PSI — check mutual dealbreakers.
 *
 * Both agents must pass each other's dealbreaker constraints.
 * In production, this would use DH-based Private Set Intersection.
 * Locally, we do direct comparison.
 */
function checkMutualDealbreakers(a: AgentListing, b: AgentListing): boolean {
  // A's dealbreakers must be satisfied by B's structured data
  if (a.dealbreakers) {
    for (const db of a.dealbreakers) {
      if (!checkDealbreaker(db, b.structured)) return false;
    }
  }

  // B's dealbreakers must be satisfied by A's structured data
  if (b.dealbreakers) {
    for (const db of b.dealbreakers) {
      if (!checkDealbreaker(db, a.structured)) return false;
    }
  }

  return true;
}

/**
 * Check a single dealbreaker constraint against structured data.
 */
function checkDealbreaker(
  dealbreaker: { field: string; operator: string; value?: any },
  data: Record<string, any>
): boolean {
  const actual = data[dealbreaker.field];
  if (actual === undefined) return true; // Missing field = no violation

  switch (dealbreaker.operator) {
    case "eq":
      return actual === dealbreaker.value;
    case "neq":
      return actual !== dealbreaker.value;
    case "gte":
      return Number(actual) >= Number(dealbreaker.value);
    case "lte":
      return Number(actual) <= Number(dealbreaker.value);
    case "in": {
      const allowed = Array.isArray(dealbreaker.value) ? dealbreaker.value : [dealbreaker.value];
      if (Array.isArray(actual)) {
        return actual.some((v: any) => allowed.includes(String(v)));
      }
      return allowed.includes(String(actual));
    }
    case "not_in": {
      const blocked = Array.isArray(dealbreaker.value) ? dealbreaker.value : [dealbreaker.value];
      if (Array.isArray(actual)) {
        return !actual.some((v: any) => blocked.includes(String(v)));
      }
      return !blocked.includes(String(actual));
    }
    default:
      return true;
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Convert numeric score to coarse signal.
 */
function scoreToSignal(score: number): MatchResult["signal"] {
  if (score >= 0.7) return "strong";
  if (score >= 0.5) return "good";
  if (score >= 0.3) return "possible";
  return "weak";
}
