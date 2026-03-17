import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { parseClaudeCodeFile } from "../src/extractor/claude-code-parser.js";
import { parseChatGPTFile } from "../src/extractor/chatgpt-parser.js";
import { redact } from "../src/extractor/redaction.js";
import { extractProfile } from "../src/extractor/pipeline.js";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

describe("Claude Code Parser", () => {
  it("parses JSONL file into conversations", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    expect(conversations.length).toBeGreaterThan(0);
    expect(conversations[0].source).toBe("claude-code");
    expect(conversations[0].messages.length).toBeGreaterThan(0);
  });

  it("groups messages by session", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    // Should have multiple sessions
    const sessionIds = conversations.map((c) => c.id);
    expect(new Set(sessionIds).size).toBeGreaterThan(1);
  });

  it("extracts user and assistant messages", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const allMessages = conversations.flatMap((c) => c.messages);
    const userMessages = allMessages.filter((m) => m.role === "user");
    const assistantMessages = allMessages.filter(
      (m) => m.role === "assistant"
    );

    expect(userMessages.length).toBeGreaterThan(0);
    expect(assistantMessages.length).toBeGreaterThan(0);
  });

  it("handles malformed lines gracefully", async () => {
    // The fixture has one invalid line — should skip it without crashing
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );
    expect(conversations.length).toBeGreaterThan(0);
  });

  it("preserves metadata (cwd, gitBranch)", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const withCwd = conversations
      .flatMap((c) => c.messages)
      .filter((m) => m.metadata?.cwd);
    expect(withCwd.length).toBeGreaterThan(0);
  });
});

describe("ChatGPT Parser", () => {
  it("parses JSON file into conversations", async () => {
    const conversations = await parseChatGPTFile(
      path.join(FIXTURES, "chatgpt-sample.json")
    );

    expect(conversations.length).toBe(2);
    expect(conversations[0].source).toBe("chatgpt");
  });

  it("extracts messages from DAG structure", async () => {
    const conversations = await parseChatGPTFile(
      path.join(FIXTURES, "chatgpt-sample.json")
    );

    const firstConv = conversations[0];
    const userMessages = firstConv.messages.filter(
      (m) => m.role === "user"
    );
    expect(userMessages.length).toBeGreaterThan(0);
    expect(userMessages[0].content).toContain("pandas");
  });

  it("handles forks (message edits)", async () => {
    const conversations = await parseChatGPTFile(
      path.join(FIXTURES, "chatgpt-sample.json")
    );

    // Second conversation has a fork (msg-b2 and msg-b3 both children of msg-b1)
    const secondConv = conversations[1];
    const userMessages = secondConv.messages.filter(
      (m) => m.role === "user"
    );
    // Should include both the original and edited message
    expect(userMessages.length).toBe(2);
  });

  it("detects cycles in DAG", async () => {
    // Create a cyclic mapping
    const cyclicData = [
      {
        title: "Cyclic",
        create_time: 1705000000,
        update_time: 1705000100,
        mapping: {
          a: {
            id: "a",
            message: null,
            parent: null,
            children: ["b"],
          },
          b: {
            id: "b",
            message: null,
            parent: "a",
            children: ["c"],
          },
          c: {
            id: "c",
            message: null,
            parent: "b",
            children: ["a"], // CYCLE: c → a
          },
        },
      },
    ];

    const fs = await import("node:fs");
    const tmpFile = path.join(FIXTURES, "_cyclic-test.json");
    fs.writeFileSync(tmpFile, JSON.stringify(cyclicData));

    try {
      const conversations = await parseChatGPTFile(tmpFile);
      // Should skip the cyclic conversation
      expect(conversations.length).toBe(0);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe("Redaction Filter", () => {
  it("redacts OpenAI API keys", () => {
    const result = redact("My key is sk-proj-abc123456789012345678901234567890123");
    expect(result.text).toContain("[REDACTED_OPENAI_KEY]");
    expect(result.text).not.toContain("sk-proj-");
    expect(result.totalRedacted).toBeGreaterThan(0);
  });

  it("redacts AWS access keys", () => {
    const result = redact("AWS key: AKIAIOSFODNN7EXAMPLE");
    expect(result.text).toContain("[REDACTED_AWS_KEY]");
    expect(result.text).not.toContain("AKIA");
  });

  it("redacts email addresses", () => {
    const result = redact("Contact me at jane@example.com for details");
    expect(result.text).toContain("[REDACTED_EMAIL]");
    expect(result.text).not.toContain("jane@example.com");
  });

  it("redacts SSN patterns", () => {
    const result = redact("SSN: 123-45-6789");
    expect(result.text).toContain("[REDACTED_SSN]");
  });

  it("redacts GitHub tokens", () => {
    const result = redact(
      "Use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij for auth"
    );
    expect(result.text).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(result.text).not.toContain("ghp_");
  });

  it("does not redact benign text", () => {
    const result = redact(
      "I love programming in Rust and building distributed systems"
    );
    expect(result.text).toBe(
      "I love programming in Rust and building distributed systems"
    );
    expect(result.totalRedacted).toBe(0);
  });

  it("handles multiple redactions in one text", () => {
    const result = redact(
      "key=sk-proj-abc123456789012345678901234567890123 email=test@example.com"
    );
    expect(result.totalRedacted).toBeGreaterThanOrEqual(2);
  });
});

describe("Extraction Pipeline", () => {
  it("extracts skills from conversations", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const profile = extractProfile(conversations);

    expect(profile.skills.length).toBeGreaterThan(0);
    // Should detect Rust from the fixture
    const rustSkill = profile.skills.find((s) => s.name === "rust");
    expect(rustSkill).toBeDefined();
    expect(rustSkill!.confidence).toBeGreaterThan(0);
    expect(rustSkill!.mentions).toBeGreaterThan(0);
  });

  it("extracts interests from conversations", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const profile = extractProfile(conversations);

    // Should detect hiking and photography from the fixture
    const hikingInterest = profile.interests.find(
      (i) => i.topic === "hiking"
    );
    expect(hikingInterest).toBeDefined();
  });

  it("redacts sensitive content before extraction", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const profile = extractProfile(conversations);

    // The profile should not contain any API keys
    const profileJson = JSON.stringify(profile);
    expect(profileJson).not.toContain("sk-proj-");
    expect(profileJson).not.toContain("AKIA");
  });

  it("produces valid metadata", async () => {
    const conversations = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );

    const profile = extractProfile(conversations);

    expect(profile.metadata.extractedAt).toBeDefined();
    expect(profile.metadata.conversationCount).toBeGreaterThan(0);
    expect(profile.metadata.sourceBreakdown["claude-code"]).toBeGreaterThan(0);
  });

  it("works with ChatGPT conversations", async () => {
    const conversations = await parseChatGPTFile(
      path.join(FIXTURES, "chatgpt-sample.json")
    );

    const profile = extractProfile(conversations);

    expect(profile.skills.length).toBeGreaterThan(0);
    // Should detect Python from the fixture
    const pythonSkill = profile.skills.find((s) => s.name === "python");
    expect(pythonSkill).toBeDefined();
  });

  it("works with combined sources", async () => {
    const claude = await parseClaudeCodeFile(
      path.join(FIXTURES, "claude-code-sample.jsonl")
    );
    const chatgpt = await parseChatGPTFile(
      path.join(FIXTURES, "chatgpt-sample.json")
    );

    const profile = extractProfile([...claude, ...chatgpt]);

    expect(profile.metadata.sourceBreakdown["claude-code"]).toBeGreaterThan(0);
    expect(profile.metadata.sourceBreakdown["chatgpt"]).toBeGreaterThan(0);

    // Should have skills from both sources
    const rustSkill = profile.skills.find((s) => s.name === "rust");
    const pythonSkill = profile.skills.find((s) => s.name === "python");
    expect(rustSkill).toBeDefined();
    expect(pythonSkill).toBeDefined();
  });
});
