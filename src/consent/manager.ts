/**
 * Consent Manager — evaluates sharing policies and prompts user.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { AgentCard } from "../a2a/types.js";

export interface ConsentPolicy {
  default_action: "deny" | "allow" | "prompt";
  rules: ConsentRule[];
}

export interface ConsentRule {
  domain: string;
  purpose?: string;
  action: "allow" | "deny" | "prompt";
  attributes?: string[];
  added_at?: string;
}

export interface ConsentDecision {
  allowed: boolean;
  attributes: string[];
  persist: boolean; // "always allow" = true
}

/**
 * Load consent policy from file.
 */
export function loadPolicy(policyPath: string): ConsentPolicy {
  if (!fs.existsSync(policyPath)) {
    return { default_action: "deny", rules: [] };
  }
  const raw = fs.readFileSync(policyPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Save consent policy to file.
 */
export function savePolicy(policyPath: string, policy: ConsentPolicy): void {
  const dir = path.dirname(policyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2), {
    mode: 0o600,
  });
}

/**
 * Evaluate consent for a sharing request.
 * Returns the decision without prompting (for policy-based decisions).
 */
export function evaluatePolicy(
  policy: ConsentPolicy,
  domain: string,
  purpose?: string,
  requestedAttributes?: string[]
): { action: "allow" | "deny" | "prompt"; matchedRule?: ConsentRule } {
  // Check specific rules first (most specific match wins)
  for (const rule of policy.rules) {
    if (rule.domain !== domain) continue;
    if (rule.purpose && purpose && rule.purpose !== purpose) continue;

    return { action: rule.action, matchedRule: rule };
  }

  // No matching rule — use default
  return { action: policy.default_action === "allow" ? "allow" : "prompt" };
}

/**
 * Add a new rule to the policy (for "always allow" decisions).
 */
export function addRule(
  policy: ConsentPolicy,
  rule: ConsentRule
): ConsentPolicy {
  // Remove existing rules for the same domain+purpose
  const filtered = policy.rules.filter(
    (r) => !(r.domain === rule.domain && r.purpose === rule.purpose)
  );

  return {
    ...policy,
    rules: [...filtered, { ...rule, added_at: new Date().toISOString() }],
  };
}

/**
 * Format a consent prompt for display.
 */
export function formatConsentPrompt(
  agent: AgentCard,
  purpose: string | undefined,
  attributes: string[],
  trustLevel: string = "unknown"
): string {
  const lines = [
    "",
    `  ${agent.name} (${new URL(agent.url).hostname})`,
    `  Purpose: ${purpose || "not specified"}`,
    `  Trust: ${trustLevel}`,
    "",
    "  Will receive:",
    ...attributes.map((a) => `    + ${a}`),
    "",
    "  [y] Allow once  [a] Always allow  [n] Deny",
    "",
  ];
  return lines.join("\n");
}

/**
 * Prompt the user for consent via stdin.
 * Returns the decision.
 */
export async function promptConsent(
  agent: AgentCard,
  purpose: string | undefined,
  attributes: string[]
): Promise<ConsentDecision> {
  const prompt = formatConsentPrompt(agent, purpose, attributes);
  console.log(prompt);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("  Choice [y/a/n]: ", (answer) => {
      rl.close();
      const choice = answer.trim().toLowerCase();

      if (choice === "y" || choice === "yes") {
        resolve({ allowed: true, attributes, persist: false });
      } else if (choice === "a" || choice === "always") {
        resolve({ allowed: true, attributes, persist: true });
      } else {
        resolve({ allowed: false, attributes: [], persist: false });
      }
    });
  });
}
