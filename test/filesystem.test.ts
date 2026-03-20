import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeAgentFilesystem,
  deleteAgentFilesystem,
  listAgentFilesystems,
  readAgentMetadata,
  createDelegateTools,
  scoreViaFileTools,
  createDelegate,
  listDelegates,
  readDelegateMetadata,
  deleteDelegate,
  scoreDelegatesViaFileTools,
} from "../src/filesystem/agent-fs.js";

describe("File-Based Agent Filesystem", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentverse-fs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Writing ────────────────────────────────────

  describe("writeAgentFilesystem", () => {
    it("creates the correct directory structure", () => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "recruiting",
        structured: { skills: ["rust", "typescript"], experienceBand: "5-10yr" },
        evaluable_text: { about: "Built payment systems at Stripe" },
        human_only: { notes: "Looking for remote roles only" },
      });

      expect(fs.existsSync(path.join(tmpDir, "agents/alice/README.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/metadata.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/structured/skills.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/structured/experienceBand.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/evaluable/about.txt"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/human_only/notes.txt"))).toBe(true);
    });

    it("writes structured data as JSON files", () => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "recruiting",
        structured: { skills: ["rust", "typescript"] },
      });

      const skills = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "agents/alice/structured/skills.json"), "utf-8")
      );
      expect(skills).toEqual(["rust", "typescript"]);
    });

    it("writes evaluable text as plain text files", () => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "recruiting",
        structured: {},
        evaluable_text: { about: "Built payment systems at Stripe" },
      });

      const about = fs.readFileSync(
        path.join(tmpDir, "agents/alice/evaluable/about.txt"), "utf-8"
      );
      expect(about).toBe("Built payment systems at Stripe");
    });

    it("generates a README with profile overview", () => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "recruiting",
        structured: { skills: ["rust", "typescript"] },
        evaluable_text: { about: "Built payment systems" },
        human_only: { notes: "Private note" },
      });

      const readme = fs.readFileSync(
        path.join(tmpDir, "agents/alice/README.md"), "utf-8"
      );
      expect(readme).toContain("# Alice");
      expect(readme).toContain("recruiting");
      expect(readme).toContain("rust, typescript");
      expect(readme).toContain("Built payment systems");
      expect(readme).toContain("1 additional file(s) available post-match");
      // human_only content should NOT be in README
      expect(readme).not.toContain("Private note");
    });

    it("tracks metadata correctly", () => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "cofounder",
        structured: { skills: ["rust"], values: ["autonomy"] },
        evaluable_text: { about: "text" },
        human_only: { salary: "180K" },
      });

      const meta = readAgentMetadata(tmpDir, "alice");
      expect(meta?.name).toBe("Alice");
      expect(meta?.purpose).toBe("cofounder");
      expect(meta?.tiers.structured).toBe(2);
      expect(meta?.tiers.evaluable).toBe(1);
      expect(meta?.tiers.human_only).toBe(1);
    });
  });

  // ─── Listing & Deleting ─────────────────────────

  describe("listAgentFilesystems", () => {
    it("lists all agents on disk", () => {
      writeAgentFilesystem(tmpDir, "alice", { name: "Alice", purpose: "recruiting", structured: {} });
      writeAgentFilesystem(tmpDir, "bob", { name: "Bob", purpose: "recruiting", structured: {} });
      writeAgentFilesystem(tmpDir, "carol", { name: "Carol", purpose: "dating", structured: {} });

      const ids = listAgentFilesystems(tmpDir);
      expect(ids.sort()).toEqual(["alice", "bob", "carol"]);
    });

    it("returns empty array when no agents exist", () => {
      expect(listAgentFilesystems(tmpDir)).toEqual([]);
    });
  });

  describe("deleteAgentFilesystem", () => {
    it("removes the agent's directory", () => {
      writeAgentFilesystem(tmpDir, "alice", { name: "Alice", purpose: "recruiting", structured: {} });
      expect(fs.existsSync(path.join(tmpDir, "agents/alice"))).toBe(true);

      deleteAgentFilesystem(tmpDir, "alice");
      expect(fs.existsSync(path.join(tmpDir, "agents/alice"))).toBe(false);
    });
  });

  // ─── Delegate Tools ────────────────────────────

  describe("createDelegateTools", () => {
    beforeEach(() => {
      writeAgentFilesystem(tmpDir, "bob", {
        name: "Bob",
        purpose: "recruiting",
        structured: { skills: ["python", "ml"], experienceBand: "3-5yr" },
        evaluable_text: { about: "ML researcher focused on transformers" },
        human_only: { salary: "$200K target" },
      });
    });

    it("list_files shows accessible tiers only", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured", "evaluable"]);
      const entries = tools.list_files(".");
      const names = entries.map((e) => e.name);

      expect(names).toContain("structured");
      expect(names).toContain("evaluable");
      expect(names).not.toContain("human_only"); // excluded from scope
      expect(names).toContain("README.md");
      expect(names).toContain("metadata.json");
    });

    it("read_file reads structured JSON", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured"]);
      const content = tools.read_file("structured/skills.json");
      expect(JSON.parse(content)).toEqual(["python", "ml"]);
    });

    it("read_file reads evaluable text", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured", "evaluable"]);
      const content = tools.read_file("evaluable/about.txt");
      expect(content).toBe("ML researcher focused on transformers");
    });

    it("blocks access to human_only when not in scope", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured", "evaluable"]);
      expect(() => tools.read_file("human_only/salary.txt")).toThrow("Access denied");
    });

    it("allows human_only access when explicitly scoped", () => {
      const tools = createDelegateTools(tmpDir, "bob", [
        "structured", "evaluable", "human_only",
      ]);
      const content = tools.read_file("human_only/salary.txt");
      expect(content).toBe("$200K target");
    });

    it("blocks path traversal attacks", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured"]);
      expect(() => tools.read_file("../../etc/passwd")).toThrow("path traversal");
      expect(() => tools.read_file("../alice/structured/skills.json")).toThrow("path traversal");
    });

    it("search finds content across accessible tiers", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured", "evaluable"]);
      const results = tools.search("python");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.file.includes("skills.json"))).toBe(true);
    });

    it("search does NOT find content in excluded tiers", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured"]);
      const results = tools.search("transformers"); // only in evaluable/about.txt
      expect(results.length).toBe(0);
    });

    it("read_readme returns the agent overview", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured"]);
      const readme = tools.read_readme();
      expect(readme).toContain("# Bob");
      expect(readme).toContain("python, ml");
    });

    it("get_metadata returns agent info", () => {
      const tools = createDelegateTools(tmpDir, "bob", ["structured"]);
      const meta = tools.get_metadata();
      expect(meta.name).toBe("Bob");
      expect(meta.purpose).toBe("recruiting");
    });
  });

  // ─── Scoring via File Tools ─────────────────────

  describe("scoreViaFileTools", () => {
    beforeEach(() => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        purpose: "recruiting",
        structured: { skills: ["rust", "typescript", "distributed-systems"] },
        evaluable_text: { about: "Built payment infrastructure at Stripe" },
      });
      writeAgentFilesystem(tmpDir, "bob", {
        name: "Bob",
        purpose: "recruiting",
        structured: { skills: ["rust", "go", "kubernetes"] },
        evaluable_text: { about: "Cloud infrastructure engineer" },
      });
    });

    it("scores compatibility between two agents", () => {
      const result = scoreViaFileTools(tmpDir, "alice", "bob");
      expect(result.signal).toBeDefined();
      expect(["strong", "good", "possible", "weak"]).toContain(result.signal);
      expect(result.matched_on).toContain("rust");
      expect(result.files_read.length).toBeGreaterThan(0);
    });

    it("tracks which files were read during scoring", () => {
      const result = scoreViaFileTools(tmpDir, "alice", "bob");
      expect(result.files_read.some((f) => f.includes("skills.json"))).toBe(true);
      expect(result.files_read.some((f) => f.includes("README.md"))).toBe(true);
      // human_only should NOT be in files_read
      expect(result.files_read.some((f) => f.includes("human_only"))).toBe(false);
    });

    it("produces a summary with agent names", () => {
      const result = scoreViaFileTools(tmpDir, "alice", "bob");
      expect(result.summary).toContain("Alice");
      expect(result.summary).toContain("Bob");
      expect(result.summary).toContain("rust");
    });

    it("identifies gaps (skills one has that the other doesn't)", () => {
      const result = scoreViaFileTools(tmpDir, "alice", "bob");
      expect(result.gaps.some((g) => g.includes("typescript"))).toBe(true);
      expect(result.gaps.some((g) => g.includes("kubernetes"))).toBe(true);
    });
  });

  // ─── Delegate Management ────────────────────────

  describe("Delegates (purpose-scoped projections)", () => {
    beforeEach(() => {
      // Create a main agent with lots of data
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        structured: {
          skills: ["rust", "typescript", "cryptography", "distributed-systems"],
          values: ["autonomy", "impact", "privacy"],
          experienceBand: "5-10yr",
          interests: ["hiking", "photography"],
          domains: ["fintech", "privacy-tech"],
          looking_for: ["biz-cofounder"],
        },
        evaluable_text: {
          about: "Built payment infrastructure at Stripe",
          vision: "Privacy layer for AI agents",
          projects: "Led team of 5 on real-time payments",
        },
        human_only: {
          salary: "180-220K",
          notes: "Looking for remote only",
        },
      });
    });

    it("creates a delegate with purpose-specific subset of data", () => {
      const delegatePath = createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      expect(fs.existsSync(delegatePath)).toBe(true);
      expect(fs.existsSync(path.join(delegatePath, "metadata.json"))).toBe(true);
      expect(fs.existsSync(path.join(delegatePath, "README.md"))).toBe(true);

      // Recruiting delegate should have skills but NOT interests or looking_for
      expect(fs.existsSync(path.join(delegatePath, "structured/skills.json"))).toBe(true);
      expect(fs.existsSync(path.join(delegatePath, "structured/experienceBand.json"))).toBe(true);
      // Should NOT have human_only directory at all
      expect(fs.existsSync(path.join(delegatePath, "human_only"))).toBe(false);
    });

    it("delegate metadata references parent agent", () => {
      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      const meta = readDelegateMetadata(tmpDir, "alice", "recruiting");
      expect(meta?.parent_agent_id).toBe("alice");
      expect(meta?.parent_agent_name).toBe("Alice");
      expect(meta?.purpose).toBe("recruiting");
    });

    it("different purposes get different subsets", () => {
      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      createDelegate(tmpDir, "alice", { purpose: "cofounder" });

      // Recruiting should have skills, experienceBand
      const recruitingSkills = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "agents/alice/delegates/recruiting/structured/skills.json"), "utf-8")
      );
      expect(recruitingSkills).toContain("rust");

      // Cofounder should have skills, values, looking_for
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/delegates/cofounder/structured/looking_for.json"))).toBe(true);
    });

    it("listDelegates returns all delegate purposes", () => {
      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      createDelegate(tmpDir, "alice", { purpose: "cofounder" });
      const delegates = listDelegates(tmpDir, "alice");
      expect(delegates.sort()).toEqual(["cofounder", "recruiting"]);
    });

    it("deleteDelegate removes the delegate directory", () => {
      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/delegates/recruiting"))).toBe(true);
      deleteDelegate(tmpDir, "alice", "recruiting");
      expect(fs.existsSync(path.join(tmpDir, "agents/alice/delegates/recruiting"))).toBe(false);
    });

    it("delegate never includes human_only data", () => {
      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      const delegateDir = path.join(tmpDir, "agents/alice/delegates/recruiting");
      // Walk the entire delegate directory — no human_only anywhere
      const allFiles = getAllFiles(delegateDir);
      expect(allFiles.some(f => f.includes("human_only"))).toBe(false);
      expect(allFiles.some(f => f.includes("salary"))).toBe(false);
    });

    it("supports custom field selection", () => {
      createDelegate(tmpDir, "alice", {
        purpose: "custom",
        include_structured: ["skills", "interests"],
        include_evaluable: ["about"],
      });

      const delegateDir = path.join(tmpDir, "agents/alice/delegates/custom");
      expect(fs.existsSync(path.join(delegateDir, "structured/skills.json"))).toBe(true);
      expect(fs.existsSync(path.join(delegateDir, "structured/interests.json"))).toBe(true);
      // Should NOT have experienceBand (not in include list)
      expect(fs.existsSync(path.join(delegateDir, "structured/experienceBand.json"))).toBe(false);
    });

    it("supports extra fields not from parent", () => {
      createDelegate(tmpDir, "alice", {
        purpose: "custom",
        include_structured: ["skills"],
        extra_structured: { availability: "full-time" },
        extra_evaluable: { pitch: "Building the future of privacy" },
      });

      const delegateDir = path.join(tmpDir, "agents/alice/delegates/custom");
      const avail = JSON.parse(fs.readFileSync(path.join(delegateDir, "structured/availability.json"), "utf-8"));
      expect(avail).toBe("full-time");
      const pitch = fs.readFileSync(path.join(delegateDir, "evaluable/pitch.txt"), "utf-8");
      expect(pitch).toBe("Building the future of privacy");
    });
  });

  // ─── Delegate Scoring ───────────────────────────

  describe("scoreDelegatesViaFileTools", () => {
    beforeEach(() => {
      writeAgentFilesystem(tmpDir, "alice", {
        name: "Alice",
        structured: { skills: ["rust", "typescript"], values: ["autonomy"] },
        evaluable_text: { about: "Stripe engineer" },
        human_only: { salary: "200K" },
      });
      writeAgentFilesystem(tmpDir, "bob", {
        name: "Bob",
        structured: { skills: ["rust", "go"], values: ["impact"] },
        evaluable_text: { about: "Cloud infrastructure" },
        human_only: { salary: "180K" },
      });

      createDelegate(tmpDir, "alice", { purpose: "recruiting" });
      createDelegate(tmpDir, "bob", { purpose: "recruiting" });
    });

    it("scores compatibility between two delegates", () => {
      const result = scoreDelegatesViaFileTools(tmpDir, "alice", "recruiting", "bob", "recruiting");
      expect(["strong", "good", "possible", "weak"]).toContain(result.signal);
      expect(result.matched_on).toContain("rust");
      expect(result.files_read.length).toBeGreaterThan(0);
    });

    it("does not read human_only files during delegate scoring", () => {
      const result = scoreDelegatesViaFileTools(tmpDir, "alice", "recruiting", "bob", "recruiting");
      expect(result.files_read.some(f => f.includes("human_only"))).toBe(false);
      expect(result.files_read.some(f => f.includes("salary"))).toBe(false);
    });
  });
});

// Helper to recursively list all files
function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      files.push(...getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}
