/**
 * Local embedding generator — substitutes for production sentence-transformers.
 *
 * In production: all-MiniLM-L6-v2 produces 384-dim embeddings.
 * Locally: TF-IDF-inspired hash-based embeddings. Same dimensionality,
 * same interface, but lower quality. Good enough for testing matching logic.
 *
 * The key property we need: similar text → similar vectors.
 * Hash-based embeddings achieve this for keyword overlap.
 */

import * as crypto from "node:crypto";

const EMBEDDING_DIM = 384;

/**
 * Generate a deterministic embedding from structured profile data.
 *
 * This is NOT a real embedding model. It's a hash-based approximation
 * that produces consistent 384-dim vectors where profiles with
 * overlapping terms produce more similar vectors.
 *
 * Production replacement: sentence-transformers all-MiniLM-L6-v2
 */
export function generateLocalEmbedding(
  structured: Record<string, any>
): number[] {
  const vector = new Float64Array(EMBEDDING_DIM).fill(0);

  // Extract all string tokens from the structured data
  const tokens = extractTokens(structured);

  // For each token, hash it to a set of dimensions and add weight
  for (const token of tokens) {
    const hash = crypto.createHash("sha256").update(token).digest();

    // Use the hash to select dimensions and set values
    for (let i = 0; i < 8; i++) {
      const dimIndex = hash.readUInt16BE(i * 2) % EMBEDDING_DIM;
      const value = (hash[16 + (i % 16)] - 128) / 128; // [-1, 1]
      vector[dimIndex] += value;
    }
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Extract string tokens from structured profile data.
 */
function extractTokens(data: Record<string, any>): string[] {
  const tokens: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    // Skip dealbreaker prefix fields
    if (key.startsWith("min_") || key.startsWith("max_") ||
        key.startsWith("required_") || key.startsWith("excluded_")) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        tokens.push(`${key}:${String(item).toLowerCase()}`);
      }
    } else if (typeof value === "string") {
      tokens.push(`${key}:${value.toLowerCase()}`);
      // Also add individual words for text fields
      for (const word of value.toLowerCase().split(/\s+/)) {
        if (word.length > 2) tokens.push(word);
      }
    } else if (typeof value === "number") {
      tokens.push(`${key}:${value}`);
    }
  }

  return tokens;
}

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
