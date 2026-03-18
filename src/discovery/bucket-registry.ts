/**
 * Bucket registry — manages purpose-specific namespaces for agent matching.
 *
 * Buckets are categories like "senior-swe-sf" or "dating-outdoors-nyc".
 * Agents from multiple venues (WeKruit, CLI, LinkedIn Bridge) submit
 * to the same bucket, enabling cross-venue matching.
 */

import * as crypto from "node:crypto";
import type { Bucket, AgentListing } from "./types.js";
import type { DelegateFilesystem } from "../delegate/types.js";

/** In-memory bucket storage (production: database). */
const buckets = new Map<string, Bucket>();
const listings = new Map<string, AgentListing[]>(); // bucket_id → listings

/** Pre-built buckets for common use cases. */
const DEFAULT_BUCKETS: Omit<Bucket, "created_at" | "updated_at">[] = [
  {
    id: "recruiting-swe",
    name: "Software Engineers",
    category: "recruiting",
    schema_fields: ["skills", "experienceBand", "locationRegion", "careerStage"],
    status: "active",
    agent_count: 0,
  },
  {
    id: "cofounder-search",
    name: "Cofounder Matching",
    category: "cofounder",
    schema_fields: ["skills", "experienceBand", "values", "lookingFor", "domain"],
    status: "active",
    agent_count: 0,
  },
  {
    id: "dating-general",
    name: "Dating",
    category: "dating",
    schema_fields: ["interests", "locationRegion", "ageRange"],
    status: "active",
    agent_count: 0,
  },
  {
    id: "freelance-dev",
    name: "Freelance Developers",
    category: "freelance",
    schema_fields: ["skills", "experienceBand", "availability", "domain"],
    status: "active",
    agent_count: 0,
  },
];

/**
 * Initialize the registry with default buckets.
 */
export function initializeRegistry(): void {
  const now = new Date().toISOString();
  for (const b of DEFAULT_BUCKETS) {
    if (!buckets.has(b.id)) {
      buckets.set(b.id, { ...b, created_at: now, updated_at: now });
      listings.set(b.id, []);
    }
  }
}

/**
 * Create a custom bucket.
 */
export function createBucket(
  name: string,
  category: Bucket["category"],
  schemaFields: string[],
  description?: string
): Bucket {
  const id = `${category}-${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const bucket: Bucket = {
    id,
    name,
    description,
    category,
    schema_fields: schemaFields,
    status: "active",
    agent_count: 0,
    created_at: now,
    updated_at: now,
  };

  buckets.set(id, bucket);
  listings.set(id, []);
  return bucket;
}

/**
 * Get a bucket by ID.
 */
export function getBucket(bucketId: string): Bucket | undefined {
  return buckets.get(bucketId);
}

/**
 * List all active buckets.
 */
export function listBuckets(category?: string): Bucket[] {
  let result = Array.from(buckets.values()).filter((b) => b.status === "active");
  if (category) {
    result = result.filter((b) => b.category === category);
  }
  return result;
}

/**
 * Submit a distilled agent to a bucket.
 *
 * @param bucketId - The bucket to submit to
 * @param filesystem - The delegate's three-tier filesystem
 * @param embedding - Optional 384-dim embedding vector for HNSW search
 * @param ttlHours - Time-to-live in hours (default: 168 = 7 days)
 */
export function submitAgent(
  bucketId: string,
  filesystem: DelegateFilesystem,
  embedding?: number[],
  ttlHours: number = 168
): AgentListing {
  const bucket = buckets.get(bucketId);
  if (!bucket) throw new Error(`Bucket "${bucketId}" not found`);
  if (bucket.status !== "active") throw new Error(`Bucket "${bucketId}" is ${bucket.status}`);

  const now = new Date();
  const listing: AgentListing = {
    id: `listing-${crypto.randomUUID().slice(0, 8)}`,
    bucket_id: bucketId,
    owner_did: filesystem.owner_did,
    structured: filesystem.structured,
    evaluable_text: filesystem.evaluable_text,
    embedding,
    dealbreakers: extractDealbreakers(filesystem),
    status: "active",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlHours * 3600000).toISOString(),
    commitment_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(filesystem.structured))
      .digest("hex"),
  };

  const bucketListings = listings.get(bucketId) || [];
  bucketListings.push(listing);
  listings.set(bucketId, bucketListings);

  bucket.agent_count = bucketListings.filter((l) => l.status === "active").length;
  bucket.updated_at = now.toISOString();

  return listing;
}

/**
 * Get all active listings in a bucket.
 */
export function getActiveListings(bucketId: string): AgentListing[] {
  const bucketListings = listings.get(bucketId) || [];
  const now = Date.now();
  return bucketListings.filter(
    (l) => l.status === "active" && new Date(l.expires_at).getTime() > now
  );
}

/**
 * Get a listing by ID.
 */
export function getListing(bucketId: string, listingId: string): AgentListing | undefined {
  return (listings.get(bucketId) || []).find((l) => l.id === listingId);
}

/**
 * Withdraw a listing.
 */
export function withdrawListing(bucketId: string, listingId: string): boolean {
  const bucketListings = listings.get(bucketId) || [];
  const listing = bucketListings.find((l) => l.id === listingId);
  if (!listing) return false;

  listing.status = "withdrawn";
  const bucket = buckets.get(bucketId);
  if (bucket) {
    bucket.agent_count = bucketListings.filter((l) => l.status === "active").length;
  }
  return true;
}

/**
 * Clean up expired listings across all buckets.
 */
export function cleanupExpiredListings(): number {
  let cleaned = 0;
  const now = Date.now();

  for (const [bucketId, bucketListings] of listings) {
    for (const listing of bucketListings) {
      if (listing.status === "active" && new Date(listing.expires_at).getTime() < now) {
        listing.status = "expired";
        cleaned++;
      }
    }

    const bucket = buckets.get(bucketId);
    if (bucket) {
      bucket.agent_count = bucketListings.filter((l) => l.status === "active").length;
    }
  }

  return cleaned;
}

/**
 * Extract dealbreakers from a filesystem's structured fields.
 * Convention: fields prefixed with "min_" or "max_" become dealbreaker constraints.
 */
function extractDealbreakers(fs: DelegateFilesystem): AgentListing["dealbreakers"] {
  const dealbreakers: NonNullable<AgentListing["dealbreakers"]> = [];

  for (const [key, value] of Object.entries(fs.structured)) {
    if (key.startsWith("min_")) {
      const field = key.replace("min_", "");
      dealbreakers.push({ field, operator: "gte", value });
    } else if (key.startsWith("max_")) {
      const field = key.replace("max_", "");
      dealbreakers.push({ field, operator: "lte", value });
    } else if (key.startsWith("required_")) {
      const field = key.replace("required_", "");
      dealbreakers.push({ field, operator: "in", value });
    } else if (key.startsWith("excluded_")) {
      const field = key.replace("excluded_", "");
      dealbreakers.push({ field, operator: "not_in", value });
    }
  }

  return dealbreakers.length > 0 ? dealbreakers : undefined;
}

/**
 * Clear all data (for testing).
 */
export function clearRegistry(): void {
  buckets.clear();
  listings.clear();
}
