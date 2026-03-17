/**
 * A2A Protocol types — Agent Cards, messages, tasks.
 */

import { z } from "zod";

export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});

export const AgentCardSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  url: z.string().url(),
  did: z.string().optional(),
  provider: z
    .object({
      organization: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  capabilities: z
    .object({
      streaming: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
    })
    .optional(),
  authentication: z.any().optional(),
  defaultInputModes: z.array(z.string()).optional(),
  defaultOutputModes: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  open_to: z.array(z.string()).optional(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export interface A2AMessage {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: {
    message: {
      role: "user";
      parts: A2APart[];
      messageId?: string;
    };
    configuration?: {
      taskId?: string;
    };
  };
}

export interface A2APart {
  type: "data";
  data: Record<string, any>;
  mediaType?: string;
}

export interface A2AResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: {
    id: string;
    status: {
      state: "completed" | "failed" | "working" | "input-required";
      message?: string;
    };
    artifacts?: any[];
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface TaskResult {
  taskId: string;
  status: "completed" | "failed" | "working" | "input-required";
  message?: string;
  artifacts?: any[];
}
