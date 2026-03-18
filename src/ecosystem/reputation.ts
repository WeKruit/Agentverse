/**
 * Reputation engine — tracks agent behavior and computes trust scores.
 *
 * 9-component weighted formula + PageRank-inspired Sybil resistance
 * via the referral graph.
 *
 * Production: scores anchored to Tessera transparency log.
 * Locally: in-memory with JSON file persistence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { readJsonFile, writeJsonFile } from "../wallet/storage.js";

/**
 * Raw metrics tracked per agent.
 */
export interface AgentMetrics {
  did: string;
  matches_proposed: number;
  matches_accepted: number;
  matches_declined: number;
  matches_expired: number; // let proposals expire without responding
  matches_completed: number; // both parties accepted + followed through
  response_time_avg_ms: number; // average time to respond to proposals
  reports_received: number; // flagged by other users
  referrals_given: number; // referral tokens issued
  referrals_received: number; // referral tokens received
  first_seen: string;
  last_active: string;
  // PageRank inputs
  referred_by: string[]; // DIDs of agents who referred this one
  referred_to: string[]; // DIDs this agent has referred
}

/**
 * Computed reputation score.
 */
export interface ReputationScore {
  did: string;
  overall: number; // 0-100
  components: {
    completion_rate: number; // 0-1
    response_rate: number; // 0-1
    response_speed: number; // 0-1
    follow_through: number; // 0-1
    no_reports: number; // 0-1
    referral_activity: number; // 0-1
    account_age: number; // 0-1
    consistency: number; // 0-1
    network_trust: number; // 0-1 (PageRank)
  };
  tier: "new" | "bronze" | "silver" | "gold" | "platinum";
  computed_at: string;
}

/** Component weights — must sum to 1.0 */
const WEIGHTS = {
  completion_rate: 0.20,
  response_rate: 0.15,
  response_speed: 0.10,
  follow_through: 0.15,
  no_reports: 0.10,
  referral_activity: 0.05,
  account_age: 0.05,
  consistency: 0.05,
  network_trust: 0.15,
};

/** In-memory metrics store. */
const metricsStore = new Map<string, AgentMetrics>();

/**
 * Initialize or get metrics for an agent.
 */
export function getOrCreateMetrics(did: string): AgentMetrics {
  if (!metricsStore.has(did)) {
    const now = new Date().toISOString();
    metricsStore.set(did, {
      did,
      matches_proposed: 0,
      matches_accepted: 0,
      matches_declined: 0,
      matches_expired: 0,
      matches_completed: 0,
      response_time_avg_ms: 0,
      reports_received: 0,
      referrals_given: 0,
      referrals_received: 0,
      first_seen: now,
      last_active: now,
      referred_by: [],
      referred_to: [],
    });
  }
  return metricsStore.get(did)!;
}

/**
 * Record a match proposal sent to this agent.
 */
export function recordProposal(did: string): void {
  const m = getOrCreateMetrics(did);
  m.matches_proposed++;
  m.last_active = new Date().toISOString();
}

/**
 * Record a match acceptance.
 */
export function recordAcceptance(did: string, responseTimeMs: number): void {
  const m = getOrCreateMetrics(did);
  m.matches_accepted++;
  // Rolling average of response time
  const totalResponses = m.matches_accepted + m.matches_declined;
  m.response_time_avg_ms =
    (m.response_time_avg_ms * (totalResponses - 1) + responseTimeMs) / totalResponses;
  m.last_active = new Date().toISOString();
}

/**
 * Record a match decline.
 */
export function recordDecline(did: string): void {
  const m = getOrCreateMetrics(did);
  m.matches_declined++;
  m.last_active = new Date().toISOString();
}

/**
 * Record a proposal that expired without response.
 */
export function recordExpiry(did: string): void {
  const m = getOrCreateMetrics(did);
  m.matches_expired++;
}

/**
 * Record a completed match (both parties followed through).
 */
export function recordCompletion(did: string): void {
  const m = getOrCreateMetrics(did);
  m.matches_completed++;
  m.last_active = new Date().toISOString();
}

/**
 * Record a report/flag against this agent.
 */
export function recordReport(did: string): void {
  const m = getOrCreateMetrics(did);
  m.reports_received++;
}

/**
 * Record a referral relationship.
 */
export function recordReferral(fromDid: string, toDid: string): void {
  const from = getOrCreateMetrics(fromDid);
  const to = getOrCreateMetrics(toDid);
  from.referrals_given++;
  from.referred_to.push(toDid);
  to.referrals_received++;
  to.referred_by.push(fromDid);
}

/**
 * Compute the reputation score for an agent.
 */
export function computeReputation(did: string): ReputationScore {
  const m = getOrCreateMetrics(did);
  const now = Date.now();

  // 1. Completion rate: completed / (accepted + declined)
  const totalDecisions = m.matches_accepted + m.matches_declined;
  const completion_rate = totalDecisions > 0
    ? m.matches_completed / Math.max(m.matches_accepted, 1)
    : 0.5; // neutral for new agents

  // 2. Response rate: (accepted + declined) / proposed
  const response_rate = m.matches_proposed > 0
    ? (m.matches_accepted + m.matches_declined) / m.matches_proposed
    : 0.5;

  // 3. Response speed: faster = better (sigmoid on avg response time)
  // 1 hour = 1.0, 24 hours = 0.5, 48+ hours = 0.1
  const avgHours = m.response_time_avg_ms / 3600000;
  const response_speed = avgHours === 0 ? 0.5 : 1 / (1 + Math.exp((avgHours - 12) / 6));

  // 4. Follow through: completed / accepted
  const follow_through = m.matches_accepted > 0
    ? m.matches_completed / m.matches_accepted
    : 0.5;

  // 5. No reports: 1.0 if zero reports, decays with each report
  const no_reports = 1 / (1 + m.reports_received * 0.5);

  // 6. Referral activity: having referrals is positive signal
  const referral_activity = Math.min(
    (m.referrals_given + m.referrals_received) / 10,
    1.0
  );

  // 7. Account age: older = more trusted (log scale, caps at 180 days)
  const ageMs = now - new Date(m.first_seen).getTime();
  const ageDays = ageMs / 86400000;
  const account_age = Math.min(Math.log2(ageDays + 1) / Math.log2(181), 1.0);

  // 8. Consistency: low variance in behavior (not gaming)
  // Proxy: ratio of expired proposals (high expiry = inconsistent engagement)
  const consistency = m.matches_proposed > 0
    ? 1 - (m.matches_expired / m.matches_proposed)
    : 0.5;

  // 9. Network trust (simplified PageRank):
  // Score based on how many trusted agents referred this one
  const referrerScores = m.referred_by.map((refDid) => {
    const refMetrics = metricsStore.get(refDid);
    if (!refMetrics) return 0.1;
    // Simple: more completions = more trusted referrer
    return Math.min(refMetrics.matches_completed / 5, 1.0);
  });
  const network_trust = referrerScores.length > 0
    ? referrerScores.reduce((a, b) => a + b, 0) / referrerScores.length
    : 0.1; // low default for unreferred agents

  const components = {
    completion_rate,
    response_rate,
    response_speed,
    follow_through,
    no_reports,
    referral_activity,
    account_age,
    consistency,
    network_trust,
  };

  // Weighted sum
  let overall = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    overall += components[key as keyof typeof components] * weight;
  }
  overall = Math.round(overall * 100);

  // Tier
  let tier: ReputationScore["tier"];
  if (totalDecisions < 3) tier = "new";
  else if (overall >= 80) tier = "platinum";
  else if (overall >= 65) tier = "gold";
  else if (overall >= 50) tier = "silver";
  else tier = "bronze";

  return {
    did,
    overall,
    components,
    tier,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Get all agent metrics (for admin/debugging).
 */
export function getAllMetrics(): AgentMetrics[] {
  return Array.from(metricsStore.values());
}

/**
 * Save metrics to disk.
 */
export function saveMetrics(basePath: string): void {
  const filePath = path.join(basePath, "reputation.json");
  writeJsonFile(filePath, Array.from(metricsStore.entries()));
}

/**
 * Load metrics from disk.
 */
export function loadMetrics(basePath: string): void {
  const filePath = path.join(basePath, "reputation.json");
  if (!fs.existsSync(filePath)) return;

  const entries = readJsonFile<[string, AgentMetrics][]>(filePath);
  for (const [did, metrics] of entries) {
    metricsStore.set(did, metrics);
  }
}

/**
 * Clear all metrics (for testing).
 */
export function clearMetrics(): void {
  metricsStore.clear();
}

/**
 * Detect suspicious agents (potential Sybil/gaming).
 * Flags agents whose scores are statistically anomalous.
 */
export function detectAnomalies(): { did: string; reason: string }[] {
  const anomalies: { did: string; reason: string }[] = [];
  const allMetrics = getAllMetrics();

  for (const m of allMetrics) {
    // Flag: proposed to many but never responds
    if (m.matches_proposed > 10 && m.matches_accepted + m.matches_declined === 0) {
      anomalies.push({ did: m.did, reason: "High proposal count but zero responses" });
    }

    // Flag: perfect acceptance rate with many matches (gaming)
    if (m.matches_accepted > 20 && m.matches_declined === 0) {
      anomalies.push({ did: m.did, reason: "Suspiciously perfect acceptance rate" });
    }

    // Flag: many reports
    if (m.reports_received >= 3) {
      anomalies.push({ did: m.did, reason: `${m.reports_received} reports received` });
    }
  }

  return anomalies;
}
