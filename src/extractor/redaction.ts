/**
 * Pre-processing redaction filter.
 * Strips API keys, passwords, PII patterns before LLM extraction.
 */

export interface RedactionResult {
  text: string;
  redactions: { type: string; count: number }[];
  totalRedacted: number;
}

const PATTERNS: { name: string; regex: RegExp }[] = [
  // API keys — MOST SPECIFIC FIRST (before generic patterns)
  { name: "ANTHROPIC_KEY", regex: /sk-ant-[a-zA-Z0-9-]{20,}/g },
  { name: "STRIPE_KEY", regex: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/g },
  { name: "OPENAI_KEY", regex: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g },
  { name: "AWS_KEY", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "GITHUB_TOKEN", regex: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: "NPM_TOKEN", regex: /npm_[A-Za-z0-9]{36,}/g },
  { name: "SLACK_TOKEN", regex: /xox[bpras]-[A-Za-z0-9-]{10,}/g },

  // Private keys (PEM format)
  {
    name: "PRIVATE_KEY",
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  },

  // JWT tokens
  {
    name: "JWT",
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  },

  // SSN (before phone to avoid SSN being matched as phone)
  { name: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/g },

  // Email addresses
  {
    name: "EMAIL",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },

  // Passwords / secrets in key=value format (AFTER specific token patterns)
  {
    name: "SECRET_VALUE",
    regex:
      /(?:password|passwd|secret|api_key|apikey|access_key)\s*[=:]\s*['"]?[^\s'"]{8,}/gi,
  },

  // Credit card numbers (basic Luhn-candidate patterns)
  { name: "CREDIT_CARD", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },

  // Phone numbers (US and international) — LAST because it's the most greedy
  {
    name: "PHONE",
    regex:
      /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  },
];

/**
 * Redact sensitive patterns from text.
 */
export function redact(text: string): RedactionResult {
  let result = text;
  const redactions: { type: string; count: number }[] = [];
  let totalRedacted = 0;

  for (const { name, regex } of PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      result = result.replace(regex, `[REDACTED_${name}]`);
      redactions.push({ type: name, count: matches.length });
      totalRedacted += matches.length;
    }
  }

  return { text: result, redactions, totalRedacted };
}
