/**
 * Agent Card discovery and fetching.
 */

import { AgentCardSchema, type AgentCard } from "./types.js";

const AGENT_CARD_PATHS = [
  "/.well-known/agent.json",
  "/.well-known/agent-card.json",
];

const FETCH_TIMEOUT = 10_000;

/**
 * Fetch and validate an Agent Card from a domain.
 */
export async function fetchAgentCard(domain: string): Promise<AgentCard> {
  // Normalize domain
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  let lastError: Error | null = null;

  for (const path of AGENT_CARD_PATHS) {
    const url = `${baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} from ${url}`);
        continue;
      }

      const data = await response.json();
      const parsed = AgentCardSchema.safeParse(data);

      if (!parsed.success) {
        lastError = new Error(
          `Invalid Agent Card at ${url}: ${parsed.error.message}`
        );
        continue;
      }

      return parsed.data;
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  throw new Error(
    `Failed to fetch Agent Card from ${domain}: ${lastError?.message}`
  );
}

/**
 * Validate an Agent Card object (for testing / local cards).
 */
export function validateAgentCard(data: unknown): AgentCard {
  return AgentCardSchema.parse(data);
}
