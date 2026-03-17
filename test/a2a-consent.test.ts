import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { validateAgentCard } from "../src/a2a/agent-card.js";
import {
  loadPolicy,
  savePolicy,
  evaluatePolicy,
  addRule,
  formatConsentPrompt,
  type ConsentPolicy,
} from "../src/consent/manager.js";
import {
  logSharingEvent,
  readAuditLog,
  verifyAuditChain,
} from "../src/consent/audit.js";

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-a2a-test-"));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("Agent Card Validation", () => {
  it("validates a correct Agent Card", () => {
    const card = validateAgentCard({
      name: "Test Agent",
      url: "https://test.example.com/a2a",
      did: "did:web:test.example.com",
      skills: [
        { id: "test", name: "Test Skill", tags: ["test"] },
      ],
      open_to: ["testing"],
    });

    expect(card.name).toBe("Test Agent");
    expect(card.url).toBe("https://test.example.com/a2a");
    expect(card.skills).toHaveLength(1);
  });

  it("rejects Agent Card without name", () => {
    expect(() =>
      validateAgentCard({ url: "https://test.com/a2a" })
    ).toThrow();
  });

  it("rejects Agent Card without url", () => {
    expect(() => validateAgentCard({ name: "Test" })).toThrow();
  });

  it("rejects Agent Card with invalid url", () => {
    expect(() =>
      validateAgentCard({ name: "Test", url: "not-a-url" })
    ).toThrow();
  });

  it("accepts minimal Agent Card (name + url only)", () => {
    const card = validateAgentCard({
      name: "Minimal",
      url: "https://min.example.com/a2a",
    });
    expect(card.name).toBe("Minimal");
  });
});

describe("Consent Policy", () => {
  it("loads default deny policy from file", () => {
    const policyPath = path.join(testDir, "policy.json");
    savePolicy(policyPath, { default_action: "deny", rules: [] });

    const policy = loadPolicy(policyPath);
    expect(policy.default_action).toBe("deny");
    expect(policy.rules).toHaveLength(0);
  });

  it("returns default when file doesn't exist", () => {
    const policy = loadPolicy(path.join(testDir, "nonexistent.json"));
    expect(policy.default_action).toBe("deny");
  });

  it("evaluates matching domain rule", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        { domain: "ditto.ai", purpose: "dating", action: "allow" },
      ],
    };

    const result = evaluatePolicy(policy, "ditto.ai", "dating");
    expect(result.action).toBe("allow");
  });

  it("evaluates domain without purpose match", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        { domain: "ditto.ai", purpose: "dating", action: "allow" },
      ],
    };

    const result = evaluatePolicy(policy, "ditto.ai", "recruiting");
    expect(result.action).toBe("prompt"); // No match, default deny → prompt
  });

  it("falls back to default when no rule matches", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        { domain: "other.com", action: "allow" },
      ],
    };

    const result = evaluatePolicy(policy, "unknown.com");
    expect(result.action).toBe("prompt");
  });

  it("adds a new rule", () => {
    const policy: ConsentPolicy = { default_action: "deny", rules: [] };
    const updated = addRule(policy, {
      domain: "wekruit.com",
      purpose: "recruiting",
      action: "allow",
      attributes: ["skills", "experience"],
    });

    expect(updated.rules).toHaveLength(1);
    expect(updated.rules[0].domain).toBe("wekruit.com");
    expect(updated.rules[0].added_at).toBeDefined();
  });

  it("replaces existing rule for same domain+purpose", () => {
    const policy: ConsentPolicy = {
      default_action: "deny",
      rules: [
        { domain: "wekruit.com", purpose: "recruiting", action: "deny" },
      ],
    };

    const updated = addRule(policy, {
      domain: "wekruit.com",
      purpose: "recruiting",
      action: "allow",
    });

    expect(updated.rules).toHaveLength(1);
    expect(updated.rules[0].action).toBe("allow");
  });

  it("formats consent prompt", () => {
    const prompt = formatConsentPrompt(
      {
        name: "Ditto AI",
        url: "https://ditto.ai/a2a",
        did: "did:web:ditto.ai",
      },
      "dating",
      ["interests", "age_range", "location_city"],
      "first-interaction"
    );

    expect(prompt).toContain("Ditto AI");
    expect(prompt).toContain("dating");
    expect(prompt).toContain("interests");
    expect(prompt).toContain("age_range");
    expect(prompt).toContain("first-interaction");
  });
});

describe("Audit Log", () => {
  const getLogPath = () => path.join(testDir, "audit", "sharing.log");

  it("logs a sharing event", () => {
    const logPath = getLogPath();
    const entry = logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      purpose: "dating",
      attributes_disclosed: ["interests", "age_range"],
      status: "shared",
    });

    expect(entry.seq).toBe(0);
    expect(entry.agent_domain).toBe("ditto.ai");
    expect(entry.attributes_disclosed).toEqual(["interests", "age_range"]);
    expect(entry.hash).toBeDefined();
    expect(entry.prev_hash).toMatch(/^0{64}$/); // Genesis hash
  });

  it("maintains hash chain across multiple entries", () => {
    const logPath = getLogPath();

    const entry1 = logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      attributes_disclosed: ["interests"],
      status: "shared",
    });

    const entry2 = logSharingEvent(logPath, {
      agent_domain: "wekruit.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    expect(entry2.seq).toBe(1);
    expect(entry2.prev_hash).toBe(entry1.hash);
    expect(entry2.hash).not.toBe(entry1.hash);
  });

  it("reads audit log entries", () => {
    const logPath = getLogPath();

    logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      attributes_disclosed: ["interests"],
      status: "shared",
    });
    logSharingEvent(logPath, {
      agent_domain: "wekruit.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    const entries = readAuditLog(logPath);
    expect(entries).toHaveLength(2);
  });

  it("filters audit log by domain", () => {
    const logPath = getLogPath();

    logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      attributes_disclosed: ["interests"],
      status: "shared",
    });
    logSharingEvent(logPath, {
      agent_domain: "wekruit.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    const entries = readAuditLog(logPath, { agent_domain: "ditto.ai" });
    expect(entries).toHaveLength(1);
    expect(entries[0].agent_domain).toBe("ditto.ai");
  });

  it("verifies hash chain integrity", () => {
    const logPath = getLogPath();

    logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      attributes_disclosed: ["interests"],
      status: "shared",
    });
    logSharingEvent(logPath, {
      agent_domain: "wekruit.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    const result = verifyAuditChain(logPath);
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(2);
  });

  it("detects tampered audit log", () => {
    const logPath = getLogPath();

    logSharingEvent(logPath, {
      agent_domain: "ditto.ai",
      attributes_disclosed: ["interests"],
      status: "shared",
    });
    logSharingEvent(logPath, {
      agent_domain: "wekruit.com",
      attributes_disclosed: ["skills"],
      status: "shared",
    });

    // Tamper with the log — modify an entry
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const entry = JSON.parse(lines[0]);
    entry.attributes_disclosed = ["everything"]; // tamper!
    lines[0] = JSON.stringify(entry);
    fs.writeFileSync(logPath, lines.join("\n") + "\n");

    const result = verifyAuditChain(logPath);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("logs denied events", () => {
    const logPath = getLogPath();

    const entry = logSharingEvent(logPath, {
      agent_domain: "evil.com",
      attributes_disclosed: [],
      status: "denied",
    });

    expect(entry.status).toBe("denied");
    expect(entry.attributes_disclosed).toEqual([]);
  });

  it("returns empty for nonexistent log", () => {
    const entries = readAuditLog(path.join(testDir, "nonexistent.log"));
    expect(entries).toEqual([]);
  });

  it("verifies empty log as valid", () => {
    const result = verifyAuditChain(path.join(testDir, "nonexistent.log"));
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(0);
  });
});
