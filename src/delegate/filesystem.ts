/**
 * Split filesystem builder.
 *
 * Builds a three-tier delegate filesystem from an extracted profile
 * based on purpose and preset. The filesystem is the delegate's
 * entire world — it only sees what's in here.
 */

import type { ExtractedProfile } from "../extractor/types.js";
import type { DelegateFilesystem } from "./types.js";

/** Purpose-to-fields mapping: what structured fields are relevant for each purpose. */
const PURPOSE_FIELDS: Record<string, {
  structured: string[];
  evaluable: string[];
  human_only: string[];
}> = {
  recruiting: {
    structured: ["skills", "experienceBand", "values", "availability", "locationRegion", "careerStage"],
    evaluable: ["about", "projectHighlights"],
    human_only: ["fullTranscript"],
  },
  cofounder: {
    structured: ["skills", "experienceBand", "values", "availability", "lookingFor", "domain"],
    evaluable: ["about", "vision", "projectHighlights"],
    human_only: ["references"],
  },
  dating: {
    structured: ["interests", "locationRegion", "ageRange", "spokenLanguages"],
    evaluable: ["about", "personalityDescription"],
    human_only: ["fullBio"],
  },
  collaboration: {
    structured: ["skills", "experienceBand", "interests", "availability"],
    evaluable: ["about", "projectHighlights"],
    human_only: [],
  },
  freelance: {
    structured: ["skills", "experienceBand", "availability", "locationRegion", "domain"],
    evaluable: ["about", "projectHighlights"],
    human_only: ["rateHistory"],
  },
};

/**
 * Build a delegate filesystem from an extracted profile.
 *
 * @param profile - The user's extracted profile
 * @param purpose - The purpose of this delegate (recruiting, dating, etc.)
 * @param ownerDid - The user's DID
 * @param ttlHours - How long this filesystem is valid (default: 48 hours)
 */
export function buildFilesystem(
  profile: ExtractedProfile,
  purpose: string,
  ownerDid: string,
  ttlHours: number = 48
): DelegateFilesystem {
  const fields = PURPOSE_FIELDS[purpose] || PURPOSE_FIELDS.collaboration;
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  // Build structured tier (enum-only values)
  const structured: Record<string, any> = {};
  for (const field of fields.structured) {
    const value = extractField(profile, field);
    if (value !== undefined) {
      structured[field] = value;
    }
  }

  // Build evaluable_text tier (free text that IS the signal)
  const evaluable_text: Record<string, string> = {};
  for (const field of fields.evaluable) {
    const value = extractTextField(profile, field);
    if (value) {
      evaluable_text[field] = value;
    }
  }

  // Build human_only tier (context for human, never for LLM)
  const human_only: Record<string, string> = {};
  for (const field of fields.human_only) {
    const value = extractTextField(profile, field);
    if (value) {
      human_only[field] = value;
    }
  }

  return {
    purpose,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    owner_did: ownerDid,
    structured,
    evaluable_text: Object.keys(evaluable_text).length > 0 ? evaluable_text : undefined,
    human_only: Object.keys(human_only).length > 0 ? human_only : undefined,
  };
}

/**
 * Extract a structured field value from the profile.
 * Returns enum-safe values (strings, string arrays, numbers).
 */
function extractField(profile: ExtractedProfile, field: string): any {
  switch (field) {
    case "skills":
      return profile.skills.map((s) => s.name);
    case "experienceBand":
      return inferExperienceBand(profile.skills);
    case "values":
      return profile.values.length > 0 ? profile.values : undefined;
    case "availability":
      return undefined; // Not in base profile — set by user
    case "locationRegion":
      return profile.demographics.locationGeneral || undefined;
    case "interests":
      return profile.interests.map((i) => i.topic);
    case "lookingFor":
      return undefined; // Set by user per-purpose
    case "domain":
      return undefined; // Set by user
    case "ageRange":
      return profile.demographics.ageRange || undefined;
    case "spokenLanguages":
      return profile.demographics.spokenLanguages;
    case "careerStage":
      return profile.career.careerStage;
    default:
      return undefined;
  }
}

/**
 * Extract a free-text field from the profile.
 */
function extractTextField(profile: ExtractedProfile, field: string): string | undefined {
  switch (field) {
    case "about":
      // Synthesize from career context
      const parts: string[] = [];
      if (profile.career.currentRole) parts.push(profile.career.currentRole);
      if (profile.career.industry) parts.push(`in ${profile.career.industry}`);
      if (profile.skills.length > 0) {
        parts.push(`Skills: ${profile.skills.slice(0, 5).map((s) => s.name).join(", ")}`);
      }
      return parts.length > 0 ? parts.join(". ") + "." : undefined;
    case "projectHighlights":
      return profile.skills
        .filter((s) => s.confidence > 0.7)
        .map((s) => s.name)
        .join(", ") || undefined;
    default:
      return undefined;
  }
}

function inferExperienceBand(skills: { mentions: number }[]): string {
  if (skills.length === 0) return "0-1yr";
  const maxMentions = Math.max(...skills.map((s) => s.mentions));
  if (maxMentions > 20) return "10+yr";
  if (maxMentions > 10) return "5-10yr";
  if (maxMentions > 5) return "3-5yr";
  return "1-3yr";
}

/**
 * Check if a filesystem has expired.
 */
export function isExpired(fs: DelegateFilesystem): boolean {
  if (!fs.expires_at) return false;
  return new Date(fs.expires_at).getTime() < Date.now();
}

/**
 * Get the list of structured field names in a filesystem.
 */
export function getStructuredFields(fs: DelegateFilesystem): string[] {
  return Object.keys(fs.structured);
}

/**
 * Get the list of evaluable text field names.
 */
export function getEvaluableFields(fs: DelegateFilesystem): string[] {
  return Object.keys(fs.evaluable_text || {});
}
