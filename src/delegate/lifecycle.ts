/**
 * Delegate lifecycle manager.
 *
 * Spawns, tracks, and destroys ephemeral delegate agents.
 * Each delegate has a scoped filesystem and produces a scoring result.
 */

import * as crypto from "node:crypto";
import type {
  DelegateInstance,
  DelegateFilesystem,
  ScoringResult,
  ScoringResultSchema,
} from "./types.js";

/** In-memory registry of active delegates. */
const activeDelegates = new Map<string, DelegateInstance>();

/**
 * Spawn a new delegate with a scoped filesystem.
 */
export function spawnDelegate(
  purpose: string,
  peerDid: string,
  filesystem: DelegateFilesystem,
  peerName?: string
): DelegateInstance {
  const id = `delegate-${crypto.randomUUID().slice(0, 8)}`;

  const delegate: DelegateInstance = {
    id,
    purpose,
    peer_did: peerDid,
    peer_name: peerName,
    filesystem,
    created_at: new Date().toISOString(),
    status: "active",
  };

  activeDelegates.set(id, delegate);
  return delegate;
}

/**
 * Score compatibility between our filesystem and the peer's filesystem.
 *
 * This is the delegate's core function: read both filesystems and produce
 * a scoring result. The delegate is a pure function with no capabilities.
 *
 * In production, this would use an LLM to evaluate the structured fields.
 * For MVP, we use deterministic overlap scoring.
 */
export function scoreCompatibility(
  ours: DelegateFilesystem,
  theirs: DelegateFilesystem
): ScoringResult {
  const matched_on: string[] = [];
  const gaps: string[] = [];
  let totalScore = 0;
  let dimensions = 0;

  // Compare each structured field
  for (const [key, ourValue] of Object.entries(ours.structured)) {
    const theirValue = theirs.structured[key];

    if (theirValue === undefined) {
      // They don't have this field — neutral
      continue;
    }

    dimensions++;

    if (Array.isArray(ourValue) && Array.isArray(theirValue)) {
      // Array overlap (skills, values, interests)
      const ourSet = new Set(ourValue.map(String));
      const theirSet = new Set(theirValue.map(String));
      const overlap = [...ourSet].filter((v) => theirSet.has(v));

      if (overlap.length > 0) {
        matched_on.push(`${key}: ${overlap.join(", ")}`);
        totalScore += overlap.length / Math.max(ourSet.size, theirSet.size);
      } else {
        gaps.push(`No overlap on ${key}`);
      }
    } else if (ourValue === theirValue) {
      // Exact match (experienceBand, careerStage)
      matched_on.push(`${key}: ${ourValue}`);
      totalScore += 1;
    } else {
      gaps.push(`${key}: ${ourValue} vs ${theirValue}`);
      totalScore += 0.3; // Partial credit for having the field
    }
  }

  const avgScore = dimensions > 0 ? totalScore / dimensions : 0;

  // Convert to coarse signal
  let signal: ScoringResult["signal"];
  if (avgScore >= 0.7) signal = "strong";
  else if (avgScore >= 0.5) signal = "good";
  else if (avgScore >= 0.3) signal = "possible";
  else signal = "weak";

  const recommend_escalate = signal === "strong" || signal === "good";

  const summary = recommend_escalate
    ? `Good compatibility on ${matched_on.length} dimensions. ${gaps.length > 0 ? `Gaps: ${gaps.slice(0, 2).join("; ")}` : ""}`
    : `Limited compatibility. ${gaps.length} gaps found.`;

  return {
    signal,
    matched_on,
    gaps,
    score_details: { average: Math.round(avgScore * 100) / 100 },
    recommend_escalate,
    summary: summary.slice(0, 500),
  };
}

/**
 * Record a scoring result for a delegate.
 */
export function recordScore(
  delegateId: string,
  result: ScoringResult
): void {
  const delegate = activeDelegates.get(delegateId);
  if (!delegate) throw new Error(`Delegate ${delegateId} not found`);

  delegate.scoring_result = result;
  delegate.status = "scored";
}

/**
 * Escalate a delegate (recommend to human).
 */
export function escalateDelegate(delegateId: string): void {
  const delegate = activeDelegates.get(delegateId);
  if (!delegate) throw new Error(`Delegate ${delegateId} not found`);

  delegate.status = "escalated";
}

/**
 * Complete and destroy a delegate.
 * All in-memory data is released.
 */
export function destroyDelegate(delegateId: string): DelegateInstance | null {
  const delegate = activeDelegates.get(delegateId);
  if (!delegate) return null;

  delegate.status = "completed";
  activeDelegates.delete(delegateId);

  return delegate;
}

/**
 * Get a delegate by ID.
 */
export function getDelegate(delegateId: string): DelegateInstance | undefined {
  return activeDelegates.get(delegateId);
}

/**
 * List all active delegates.
 */
export function listActiveDelegates(): DelegateInstance[] {
  return Array.from(activeDelegates.values()).filter(
    (d) => d.status === "active" || d.status === "scored" || d.status === "escalated"
  );
}

/**
 * Destroy all expired delegates.
 */
export function cleanupExpiredDelegates(): number {
  let cleaned = 0;
  const now = Date.now();

  for (const [id, delegate] of activeDelegates) {
    if (
      delegate.filesystem.expires_at &&
      new Date(delegate.filesystem.expires_at).getTime() < now
    ) {
      delegate.status = "expired";
      activeDelegates.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Clear all delegates (for testing).
 */
export function clearAllDelegates(): void {
  activeDelegates.clear();
}
