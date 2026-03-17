/**
 * Profile extraction pipeline.
 *
 * Parse → Redact → Extract (keyword-based stub) → Aggregate → Profile
 *
 * The LLM extraction step is a STUB in MVP. It uses keyword-based extraction
 * from conversation content (language mentions, tool mentions, etc.).
 * Real LLM extraction requires API keys and is added in Phase 1.5.
 */

import type {
  NormalizedConversation,
  ExtractedProfile,
  SkillEntry,
  InterestEntry,
} from "./types.js";
import { redact } from "./redaction.js";

// Common programming languages and tools to detect
const SKILL_PATTERNS: Record<string, RegExp> = {
  typescript: /\btypescript\b|\bts\b(?=\s|$)/gi,
  javascript: /\bjavascript\b|\bjs\b(?=\s|$)/gi,
  python: /\bpython\b/gi,
  rust: /\brust\b/gi,
  go: /\bgolang\b|\bgo\b(?=\s+(?:code|program|module|func))/gi,
  react: /\breact\b/gi,
  "next.js": /\bnext\.?js\b/gi,
  "node.js": /\bnode\.?js\b|\bnode\b(?=\s+(?:server|app|module))/gi,
  docker: /\bdocker\b/gi,
  kubernetes: /\bkubernetes\b|\bk8s\b/gi,
  postgresql: /\bpostgres(?:ql)?\b/gi,
  redis: /\bredis\b/gi,
  graphql: /\bgraphql\b/gi,
  aws: /\baws\b/gi,
  terraform: /\bterraform\b/gi,
  git: /\bgit\b(?=\s+(?:commit|push|pull|merge|rebase|branch|clone))/gi,
  sql: /\bsql\b/gi,
  css: /\bcss\b/gi,
  html: /\bhtml\b/gi,
  vue: /\bvue\.?js\b|\bvue\b/gi,
  svelte: /\bsvelte\b/gi,
  tailwind: /\btailwind\b/gi,
};

const INTEREST_KEYWORDS = [
  "hiking", "cooking", "photography", "reading", "gaming",
  "music", "travel", "fitness", "yoga", "meditation",
  "gardening", "woodworking", "painting", "writing",
  "open source", "machine learning", "AI", "blockchain",
  "climate", "sustainability", "education",
];

/**
 * Run the full extraction pipeline on normalized conversations.
 */
export function extractProfile(
  conversations: NormalizedConversation[]
): ExtractedProfile {
  // Collect all user messages
  const userMessages: { content: string; timestamp: number; source: string }[] =
    [];

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role === "user") {
        // Redact sensitive content
        const { text } = redact(msg.content);
        userMessages.push({
          content: text,
          timestamp: msg.timestamp,
          source: conv.source,
        });
      }
    }
  }

  const allText = userMessages.map((m) => m.content).join("\n");
  const now = new Date().toISOString();

  // Extract skills via keyword matching
  const skills = extractSkills(userMessages, now);

  // Extract interests via keyword matching
  const interests = extractInterests(allText);

  // Source breakdown
  const sourceBreakdown: Record<string, number> = {};
  for (const conv of conversations) {
    sourceBreakdown[conv.source] =
      (sourceBreakdown[conv.source] || 0) + 1;
  }

  return {
    skills,
    interests,
    communication: {
      verbosity: "moderate",
      formality: "professional",
      technicalDepth: skills.length > 5 ? "advanced" : "intermediate",
    },
    values: [],
    career: {
      careerStage: skills.some((s) => s.mentions > 10) ? "mid-career" : "early-career",
    },
    demographics: {
      spokenLanguages: ["English"],
    },
    metadata: {
      extractedAt: now,
      conversationCount: conversations.length,
      sourceBreakdown,
    },
  };
}

/**
 * Extract skills from user messages via keyword matching.
 */
function extractSkills(
  messages: { content: string; timestamp: number }[],
  now: string
): SkillEntry[] {
  const skillMap = new Map<
    string,
    { mentions: number; firstSeen: number; lastSeen: number }
  >();

  for (const msg of messages) {
    for (const [skill, regex] of Object.entries(SKILL_PATTERNS)) {
      regex.lastIndex = 0;
      const matches = msg.content.match(regex);
      if (matches) {
        const existing = skillMap.get(skill) || {
          mentions: 0,
          firstSeen: msg.timestamp,
          lastSeen: msg.timestamp,
        };
        existing.mentions += matches.length;
        existing.firstSeen = Math.min(existing.firstSeen, msg.timestamp);
        existing.lastSeen = Math.max(existing.lastSeen, msg.timestamp);
        skillMap.set(skill, existing);
      }
    }
  }

  return Array.from(skillMap.entries())
    .map(([name, data]) => ({
      name,
      confidence: Math.min(0.3 + data.mentions * 0.1, 0.95),
      mentions: data.mentions,
      firstSeen: new Date(data.firstSeen).toISOString(),
      lastSeen: new Date(data.lastSeen).toISOString(),
      source: "behavioral" as const,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extract interests via keyword matching.
 */
function extractInterests(text: string): InterestEntry[] {
  const lowerText = text.toLowerCase();
  return INTEREST_KEYWORDS
    .filter((keyword) => lowerText.includes(keyword.toLowerCase()))
    .map((topic) => ({
      topic,
      confidence: 0.5,
      mentions: (
        lowerText.match(new RegExp(topic.toLowerCase(), "g")) || []
      ).length,
    }));
}
