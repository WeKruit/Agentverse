/**
 * Mock A2A agent for testing.
 * Serves an Agent Card, accepts VPs via SendMessage, and logs everything.
 */

import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockAgentConfig {
  name?: string;
  responseStatus?: "completed" | "failed" | "input-required";
}

export interface ReceivedMessage {
  timestamp: string;
  method: string;
  parts: any[];
  raw: any;
}

export interface MockAgentInstance {
  url: string;
  port: number;
  server: Server;
  getReceivedMessages: () => ReceivedMessage[];
  close: () => Promise<void>;
}

/**
 * Start a mock A2A agent on a random port.
 */
export async function startMockAgent(
  config: MockAgentConfig = {}
): Promise<MockAgentInstance> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const receivedMessages: ReceivedMessage[] = [];
  const name = config.name || "Test Agent";
  const responseStatus = config.responseStatus || "completed";

  let server: Server;

  // Serve Agent Card
  app.get("/.well-known/agent.json", (_req, res) => {
    const port = (server.address() as AddressInfo).port;
    res.json({
      name,
      description: "Mock agent for Agentverse integration testing",
      version: "1.0.0",
      url: `http://localhost:${port}/a2a`,
      did: `did:web:localhost:${port}`,
      capabilities: { streaming: false, pushNotifications: false },
      authentication: { schemes: [] },
      defaultInputModes: ["application/ld+json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: "test-receive",
          name: "Receive VP",
          description: "Accepts verifiable presentations",
          tags: ["test"],
        },
      ],
      open_to: ["testing"],
    });
  });

  // A2A endpoint
  app.post("/a2a", (req, res) => {
    const body = req.body;

    // Log the received message
    receivedMessages.push({
      timestamp: new Date().toISOString(),
      method: body.method,
      parts: body.params?.message?.parts || [],
      raw: body,
    });

    // Return JSON-RPC response
    res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        id: `task-${Date.now()}`,
        status: {
          state: responseStatus,
          message:
            responseStatus === "completed"
              ? "VP received and processed"
              : "Processing failed",
        },
      },
    });
  });

  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${addr.port}`,
        port: addr.port,
        server,
        getReceivedMessages: () => [...receivedMessages],
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
