/**
 * Venue SDK — interface for venue operators to run matching services.
 *
 * A venue is an access layer (WeKruit, LinkedIn Bridge, organic CLI users)
 * that feeds agents into buckets. This SDK provides the interface for
 * operating a venue: submitting agents, running matches, managing proposals.
 *
 * In production, the matching runs inside a TEE. Locally, it runs in-process
 * with the same interface (the SimulatedTeeVenue class).
 */

import type { DelegateFilesystem } from "../delegate/types.js";
import type { AgentListing, MatchResult, MatchProposal, VenueConfig } from "./types.js";
import {
  initializeRegistry,
  submitAgent,
  getActiveListings,
  getBucket,
  listBuckets,
} from "./bucket-registry.js";
import { findMatches } from "./matching-engine.js";
import { createMatchProposals, getPendingProposals } from "./match-protocol.js";

/**
 * Venue interface — what every venue implementation must support.
 */
export interface Venue {
  config: VenueConfig;
  submit(bucketId: string, filesystem: DelegateFilesystem, embedding?: number[]): AgentListing;
  match(bucketId: string, listingId: string): MatchResult[];
  getProposals(): MatchProposal[];
}

/**
 * Simulated TEE venue — runs matching in-process for local development.
 * Same interface as a real TEE venue, but without the hardware enclave.
 */
export class SimulatedTeeVenue implements Venue {
  config: VenueConfig;

  constructor(config: VenueConfig) {
    this.config = config;
    initializeRegistry();
  }

  /**
   * Submit a distilled agent to a bucket through this venue.
   */
  submit(
    bucketId: string,
    filesystem: DelegateFilesystem,
    embedding?: number[]
  ): AgentListing {
    if (!this.config.buckets.includes(bucketId)) {
      throw new Error(
        `Venue "${this.config.name}" does not serve bucket "${bucketId}"`
      );
    }

    return submitAgent(bucketId, filesystem, embedding);
  }

  /**
   * Run matching for a listing against all active listings in its bucket.
   * Returns match results and auto-creates proposals for strong/good matches.
   */
  match(bucketId: string, listingId: string): MatchResult[] {
    const activeListings = getActiveListings(bucketId);
    const listing = activeListings.find((l) => l.id === listingId);

    if (!listing) {
      throw new Error(`Listing "${listingId}" not found in bucket "${bucketId}"`);
    }

    const results = findMatches(
      listing,
      activeListings,
      this.config.matching_config.min_score_for_proposal
    );

    // Auto-create proposals for qualifying matches
    const maxProposals = this.config.matching_config.max_proposals_per_agent;
    const topResults = results.slice(0, maxProposals);

    for (const result of topResults) {
      const peerListing = activeListings.find((l) => l.id === result.listing_b_id);
      if (peerListing) {
        createMatchProposals(result, listing, peerListing);
      }
    }

    return results;
  }

  /**
   * Get all pending proposals from this venue.
   */
  getProposals(): MatchProposal[] {
    return getPendingProposals();
  }

  /**
   * List available buckets served by this venue.
   */
  listBuckets(): ReturnType<typeof listBuckets> {
    return listBuckets().filter((b) => this.config.buckets.includes(b.id));
  }
}

/**
 * Create a default local venue for development/testing.
 */
export function createLocalVenue(name: string = "Local Dev Venue"): SimulatedTeeVenue {
  return new SimulatedTeeVenue({
    name,
    operator_did: "did:key:local-venue",
    buckets: ["recruiting-swe", "cofounder-search", "dating-general", "freelance-dev"],
    matching_config: {
      min_score_for_proposal: 0.3,
      max_proposals_per_agent: 5,
      require_mutual_dealbreakers: true,
    },
  });
}
