/**
 * A2A protocol client — sends VPs to agents via JSON-RPC 2.0.
 */

import type { A2AMessage, A2AResponse, TaskResult } from "./types.js";
import * as crypto from "node:crypto";

const SEND_TIMEOUT = 30_000;

/**
 * Send a Verifiable Presentation to an agent via A2A SendMessage.
 */
export async function sendVP(
  agentUrl: string,
  vp: Record<string, any>
): Promise<TaskResult> {
  const messageId = crypto.randomUUID();

  const rpcMessage: A2AMessage = {
    jsonrpc: "2.0",
    id: messageId,
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [
          {
            type: "data",
            data: { verifiablePresentation: vp },
            mediaType: "application/ld+json",
          },
        ],
        messageId,
      },
    },
  };

  const response = await fetch(agentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcMessage),
    signal: AbortSignal.timeout(SEND_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(
      `A2A SendMessage failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const rpcResponse = (await response.json()) as A2AResponse;

  if (rpcResponse.error) {
    throw new Error(
      `A2A error ${rpcResponse.error.code}: ${rpcResponse.error.message}`
    );
  }

  if (!rpcResponse.result) {
    throw new Error("A2A response missing result");
  }

  return {
    taskId: rpcResponse.result.id,
    status: rpcResponse.result.status.state,
    message: rpcResponse.result.status.message,
    artifacts: rpcResponse.result.artifacts,
  };
}
