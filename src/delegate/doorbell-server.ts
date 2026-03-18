/**
 * Doorbell Agent Card server.
 *
 * Serves our minimal Agent Card at /.well-known/agent.json and
 * accepts incoming contact requests at /a2a. The server exposes
 * our existence and how to reach us, but nothing about our
 * attributes, intents, or needs.
 */

import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ContactRequestSchema, type ContactRequest, type DirectContactPolicy, type TriageResult } from "./types.js";
import { triageContactRequest } from "./contact-handler.js";

export interface DoorbellConfig {
  name: string;
  did: string;
  open_to: string[];
  policy: DirectContactPolicy;
  knownDids?: Set<string>;
  onContactRequest?: (request: ContactRequest, triage: TriageResult) => void;
}

export interface DoorbellInstance {
  url: string;
  port: number;
  server: Server;
  getReceivedRequests: () => { request: ContactRequest; triage: TriageResult }[];
  close: () => Promise<void>;
}

/**
 * Start a doorbell Agent Card server.
 *
 * Serves a MINIMAL Agent Card: name + DID + endpoint + open_to.
 * No skills, no attributes, no intents revealed.
 */
export async function startDoorbellServer(
  config: DoorbellConfig,
  listenPort: number = 0
): Promise<DoorbellInstance> {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  const receivedRequests: { request: ContactRequest; triage: TriageResult }[] = [];
  let server: Server;

  // Serve minimal doorbell Agent Card
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
      // Note: NO skills, NO attributes, NO interests
      // This is a doorbell, not a window
    });
  });

  // Accept incoming contact requests
  app.post("/a2a", (req, res) => {
    const body = req.body;

    // Check if this is a contact_request
    if (body.params?.message?.parts?.[0]?.data?.type === "contact_request") {
      const parsed = ContactRequestSchema.safeParse(
        body.params.message.parts[0].data
      );

      if (!parsed.success) {
        res.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32602, message: "Invalid contact request" },
        });
        return;
      }

      const request = parsed.data;
      const triage = triageContactRequest(
        request,
        config.policy,
        config.knownDids
      );

      receivedRequests.push({ request, triage });

      // Notify callback if registered
      config.onContactRequest?.(request, triage);

      // Respond based on triage
      if (triage.action === "deny") {
        res.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            id: `task-${Date.now()}`,
            status: {
              state: "failed",
              message: "Contact request denied",
            },
          },
        });
      } else if (triage.action === "approve") {
        res.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            id: `task-${Date.now()}`,
            status: {
              state: "completed",
              message: "Contact request accepted",
            },
          },
        });
      } else {
        // Prompt — requires human approval, return pending
        res.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            id: `task-${Date.now()}`,
            status: {
              state: "input-required",
              message: "Contact request pending human approval",
            },
          },
        });
      }
      return;
    }

    // Handle standard A2A messages (VP sharing etc.)
    res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        id: `task-${Date.now()}`,
        status: {
          state: "completed",
          message: "Message received",
        },
      },
    });
  });

  return new Promise((resolve) => {
    server = app.listen(listenPort, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${addr.port}`,
        port: addr.port,
        server,
        getReceivedRequests: () => [...receivedRequests],
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
