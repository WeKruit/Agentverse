/**
 * Direct contact handler.
 *
 * Receives structured contact requests, triages them with a deterministic
 * policy engine (no LLM), and spawns delegates for approved requests.
 */

import type {
  ContactRequest,
  DirectContactPolicy,
  TriageResult,
} from "./types.js";

/** Rate limit tracking (in-memory for MVP). */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Triage an incoming contact request against the direct contact policy.
 * This is a DETERMINISTIC function — no LLM involved.
 */
export function triageContactRequest(
  request: ContactRequest,
  policy: DirectContactPolicy,
  knownDids: Set<string> = new Set()
): TriageResult {
  // 1. Rate limiting
  if (policy.rate_limits) {
    const key = `${request.from_did}:hourly`;
    const now = Date.now();
    const limit = rateLimits.get(key);

    if (limit && limit.resetAt > now) {
      if (limit.count >= policy.rate_limits.per_sender_per_hour) {
        return {
          action: "deny",
          reason: "Rate limit exceeded",
          trust_level: "unknown",
        };
      }
      limit.count++;
    } else {
      rateLimits.set(key, {
        count: 1,
        resetAt: now + 60 * 60 * 1000,
      });
    }
  }

  // 2. Determine trust level
  let trust_level: TriageResult["trust_level"] = "unknown";
  if (knownDids.has(request.from_did)) {
    trust_level = "known";
  }
  if (request.credential) {
    trust_level = "verified";
  }
  if (request.referral_token) {
    trust_level = "trusted"; // Elevated by referral
  }

  // 3. Check purpose-specific policy
  const purposePolicy = policy.purposes?.[request.purpose];

  if (!purposePolicy) {
    // No policy for this purpose — use default
    return {
      action: policy.default_action === "deny" ? "deny" : "prompt",
      reason: `No policy for purpose "${request.purpose}"`,
      trust_level,
    };
  }

  if (purposePolicy.action === "deny") {
    return {
      action: "deny",
      reason: `Purpose "${request.purpose}" is blocked by policy`,
      trust_level,
    };
  }

  // 4. Check auto-approve conditions
  if (purposePolicy.action === "allow") {
    return {
      action: "approve",
      reason: "Auto-approved by policy (action: allow)",
      trust_level,
      matched_policy: request.purpose,
    };
  }

  if (purposePolicy.auto_approve_if) {
    const autoApprove = purposePolicy.auto_approve_if;
    let approved = true;

    if (autoApprove.trust_level) {
      const trustOrder = ["unknown", "known", "verified", "trusted"];
      const required = trustOrder.indexOf(autoApprove.trust_level);
      const actual = trustOrder.indexOf(trust_level);
      if (actual < required) approved = false;
    }

    if (autoApprove.has_referral && !request.referral_token) {
      approved = false;
    }

    if (autoApprove.has_credential && !request.credential) {
      approved = false;
    }

    if (approved) {
      return {
        action: "approve",
        reason: "Auto-approved by policy conditions",
        trust_level,
        matched_policy: request.purpose,
      };
    }
  }

  // 5. Check requested topics against allowed topics
  if (purposePolicy.allowed_topics) {
    const disallowed = request.requested_topics.filter(
      (t) => !purposePolicy.allowed_topics!.includes(t)
    );
    if (disallowed.length > 0) {
      return {
        action: "deny",
        reason: `Requested topics not allowed: ${disallowed.join(", ")}`,
        trust_level,
      };
    }
  }

  // 6. Default: prompt user
  return {
    action: "prompt",
    reason: "Requires user approval",
    trust_level,
    matched_policy: request.purpose,
  };
}

/**
 * Format a contact request for user display.
 */
export function formatContactRequest(
  request: ContactRequest,
  triage: TriageResult
): string {
  const lines = [
    "",
    `  Contact Request from ${request.from_name || request.from_did}`,
    `  Purpose: ${request.purpose}`,
    `  Trust: ${triage.trust_level.toUpperCase()}${request.referral_token ? " (referred)" : ""}`,
    "",
    `  Summary: "${request.message_summary}"`,
    "",
    `  Requesting topics: ${request.requested_topics.join(", ")}`,
    "",
    "  [y] Accept  [n] Deny  [b] Block sender",
    "",
  ];
  return lines.join("\n");
}

/**
 * Clear rate limit state (for testing).
 */
export function clearRateLimits(): void {
  rateLimits.clear();
}
