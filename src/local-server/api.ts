/**
 * Local API server — substitutes for production cloud infrastructure.
 *
 * In production, this would be an Express/Fastify server deployed on EC2
 * behind a load balancer with TLS. Locally, it runs on localhost and
 * provides the same REST API interface.
 *
 * Endpoints:
 *   GET  /.well-known/agent.json     — Serve our doorbell Agent Card
 *   POST /a2a                        — Accept A2A messages (VPs, contact requests)
 *   GET  /api/buckets                — List available buckets
 *   POST /api/buckets/:id/submit     — Submit agent to bucket
 *   POST /api/buckets/:id/match      — Run matching for a listing
 *   GET  /api/proposals              — List pending match proposals
 *   POST /api/proposals/:id/accept   — Accept a proposal
 *   POST /api/proposals/:id/decline  — Decline a proposal
 */

import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLocalVenue, type SimulatedTeeVenue } from "../discovery/venue.js";
import { listBuckets, getActiveListings, getBucket } from "../discovery/bucket-registry.js";
import {
  acceptProposal,
  declineProposal,
  getPendingProposals,
  formatMatchProposal,
} from "../discovery/match-protocol.js";
import { ContactRequestSchema } from "../delegate/types.js";
import { triageContactRequest } from "../delegate/contact-handler.js";
import type { DelegateFilesystem } from "../delegate/types.js";

export interface LocalServerConfig {
  name: string;
  did: string;
  open_to: string[];
  port?: number;
}

export interface LocalServerInstance {
  url: string;
  port: number;
  server: Server;
  venue: SimulatedTeeVenue;
  close: () => Promise<void>;
}

export async function startLocalServer(
  config: LocalServerConfig
): Promise<LocalServerInstance> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const venue = createLocalVenue(config.name);
  let server: Server;

  // ─── Agent Card ──────────────────────────────────────────

  app.get("/.well-known/agent.json", (_req, res) => {
    const port = (server.address() as AddressInfo).port;
    res.json({
      name: config.name,
      url: `http://localhost:${port}/a2a`,
      did: config.did,
      open_to: config.open_to,
      capabilities: { streaming: false, pushNotifications: false },
      authentication: { schemes: [] },
      defaultInputModes: ["application/ld+json"],
      defaultOutputModes: ["application/json"],
    });
  });

  // ─── A2A Endpoint ────────────────────────────────────────

  app.post("/a2a", (req, res) => {
    const body = req.body;
    const part = body.params?.message?.parts?.[0];

    // Handle contact requests
    if (part?.data?.type === "contact_request") {
      const parsed = ContactRequestSchema.safeParse(part.data);
      if (!parsed.success) {
        return res.json({
          jsonrpc: "2.0", id: body.id,
          error: { code: -32602, message: "Invalid contact request" },
        });
      }

      const triage = triageContactRequest(parsed.data, {
        default_action: "prompt",
        purposes: Object.fromEntries(
          config.open_to.map((p) => [p, { action: "allow" as const }])
        ),
      });

      return res.json({
        jsonrpc: "2.0", id: body.id,
        result: {
          id: `task-${Date.now()}`,
          status: {
            state: triage.action === "approve" ? "completed" : triage.action === "deny" ? "failed" : "input-required",
            message: triage.reason,
          },
        },
      });
    }

    // Handle VP sharing
    res.json({
      jsonrpc: "2.0", id: body.id,
      result: {
        id: `task-${Date.now()}`,
        status: { state: "completed", message: "VP received" },
      },
    });
  });

  // ─── Bucket API ──────────────────────────────────────────

  app.get("/api/buckets", (_req, res) => {
    const buckets = listBuckets();
    res.json({ buckets });
  });

  app.get("/api/buckets/:id", (req, res) => {
    const bucket = getBucket(req.params.id);
    if (!bucket) return res.status(404).json({ error: "Bucket not found" });

    const listings = getActiveListings(req.params.id);
    res.json({ bucket, active_listings: listings.length });
  });

  app.post("/api/buckets/:id/submit", (req, res) => {
    try {
      const filesystem = req.body.filesystem as DelegateFilesystem;
      const embedding = req.body.embedding as number[] | undefined;

      const listing = venue.submit(req.params.id, filesystem, embedding);
      res.json({ listing });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/buckets/:id/match", (req, res) => {
    try {
      const { listing_id } = req.body;
      const matches = venue.match(req.params.id, listing_id);
      res.json({ matches, proposals_created: Math.min(matches.length, 5) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Proposal API ────────────────────────────────────────

  app.get("/api/proposals", (_req, res) => {
    res.json({ proposals: getPendingProposals() });
  });

  app.post("/api/proposals/:id/accept", (req, res) => {
    const proposal = acceptProposal(req.params.id);
    if (!proposal) return res.status(404).json({ error: "Proposal not found or expired" });
    res.json({ proposal });
  });

  app.post("/api/proposals/:id/decline", (req, res) => {
    const success = declineProposal(req.params.id);
    if (!success) return res.status(404).json({ error: "Proposal not found" });
    res.json({ success: true });
  });

  // ─── Health ──────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: config.name,
      did: config.did,
      buckets: listBuckets().length,
      mode: "local-simulated-tee",
    });
  });

  // ─── Start ───────────────────────────────────────────────

  return new Promise((resolve) => {
    server = app.listen(config.port || 0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${addr.port}`,
        port: addr.port,
        server,
        venue,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
