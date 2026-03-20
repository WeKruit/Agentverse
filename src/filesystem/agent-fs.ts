/**
 * File-based agent filesystem with main agent + delegate model.
 *
 * Main Agent: the full person. All their data across all tiers.
 *   agents/<id>/
 *     structured/    — ALL typed data (skills, values, interests, etc.)
 *     evaluable/     — ALL free-text descriptions
 *     human_only/    — Private data never seen by any LLM or delegate
 *
 * Delegate: a purpose-scoped projection of the main agent.
 *   agents/<id>/delegates/<purpose>/
 *     structured/    — Subset of parent's structured data, relevant to purpose
 *     evaluable/     — Subset of parent's evaluable text
 *     (NO human_only — delegates never have private data)
 *
 * The matching engine operates on DELEGATES, not main agents.
 * The main agent never enters a bucket — only its delegates do.
 *
 * Reference: https://www.llamaindex.ai/blog/files-are-all-you-need
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────

/** Config for creating a main agent (the full person). */
export interface AgentFilesystemConfig {
  name: string;
  purpose?: string; // optional — main agents don't need a purpose
  did?: string;
  structured: Record<string, any>;
  evaluable_text?: Record<string, string>;
  human_only?: Record<string, string>;
}

/** Config for creating a delegate (purpose-scoped projection). */
export interface DelegateCreateConfig {
  purpose: string;
  /** Which structured fields to include. If omitted, auto-selects based on purpose. */
  include_structured?: string[];
  /** Which evaluable fields to include. If omitted, includes all. */
  include_evaluable?: string[];
  /** Additional structured fields to add (not from parent). */
  extra_structured?: Record<string, any>;
  /** Additional evaluable fields to add (not from parent). */
  extra_evaluable?: Record<string, string>;
}

/** Default field mappings per purpose. */
const PURPOSE_FIELD_DEFAULTS: Record<string, { structured: string[]; evaluable: string[] }> = {
  recruiting: { structured: ["skills", "experienceBand", "values", "domains"], evaluable: ["about"] },
  cofounder: { structured: ["skills", "values", "domains", "looking_for"], evaluable: ["about", "vision"] },
  dating: { structured: ["interests", "values", "location"], evaluable: ["about", "hobbies"] },
  freelance: { structured: ["skills", "experienceBand", "domains", "rate"], evaluable: ["about", "portfolio"] },
};

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  tier: "structured" | "evaluable" | "human_only" | "root";
}

export interface SearchResult {
  file: string;
  tier: string;
  matches: string[];
}

// ─── Write Agent to Disk ──────────────────────────────────

/**
 * Write an agent's data as real files on disk.
 * Returns the path to the agent's root directory.
 */
export function writeAgentFilesystem(
  baseDir: string,
  agentId: string,
  config: AgentFilesystemConfig
): string {
  const agentDir = path.join(baseDir, "agents", agentId);

  // Create directory structure
  fs.mkdirSync(path.join(agentDir, "structured"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "evaluable"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "human_only"), { recursive: true });

  // Write README.md — auto-generated overview
  const readme = generateReadme(config);
  fs.writeFileSync(path.join(agentDir, "README.md"), readme);

  // Write metadata
  const metadata = {
    id: agentId,
    name: config.name,
    purpose: config.purpose,
    did: config.did || `did:key:${config.name.toLowerCase()}-${Date.now()}`,
    created_at: new Date().toISOString(),
    file_count: 0,
    tiers: { structured: 0, evaluable: 0, human_only: 0 },
  };

  // Write structured/ files (one JSON file per field)
  for (const [key, value] of Object.entries(config.structured || {})) {
    const filename = `${key}.json`;
    fs.writeFileSync(
      path.join(agentDir, "structured", filename),
      JSON.stringify(value, null, 2)
    );
    metadata.tiers.structured++;
    metadata.file_count++;
  }

  // Write evaluable/ files (one .txt file per field)
  for (const [key, value] of Object.entries(config.evaluable_text || {})) {
    const filename = `${key}.txt`;
    fs.writeFileSync(path.join(agentDir, "evaluable", filename), String(value));
    metadata.tiers.evaluable++;
    metadata.file_count++;
  }

  // Write human_only/ files (one .txt file per field)
  for (const [key, value] of Object.entries(config.human_only || {})) {
    const filename = `${key}.txt`;
    fs.writeFileSync(
      path.join(agentDir, "human_only", filename),
      String(value)
    );
    metadata.tiers.human_only++;
    metadata.file_count++;
  }

  metadata.file_count += 1; // README

  fs.writeFileSync(
    path.join(agentDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  return agentDir;
}

// ─── Delegate Management ──────────────────────────────────

/**
 * Create a delegate (purpose-scoped projection) from a main agent.
 * The delegate gets a SUBSET of the main agent's data based on purpose.
 * Returns the path to the delegate's directory.
 */
export function createDelegate(
  baseDir: string,
  agentId: string,
  config: DelegateCreateConfig
): string {
  const agentDir = path.join(baseDir, "agents", agentId);
  if (!fs.existsSync(agentDir)) {
    throw new Error(`Main agent not found: ${agentId}`);
  }

  const delegateDir = path.join(agentDir, "delegates", config.purpose);
  fs.mkdirSync(path.join(delegateDir, "structured"), { recursive: true });
  fs.mkdirSync(path.join(delegateDir, "evaluable"), { recursive: true });

  // Read main agent's metadata
  const mainMeta = JSON.parse(
    fs.readFileSync(path.join(agentDir, "metadata.json"), "utf-8")
  );

  // Determine which fields to include
  const defaults = PURPOSE_FIELD_DEFAULTS[config.purpose] || { structured: [], evaluable: [] };
  const structuredFields = config.include_structured || defaults.structured;
  const evaluableFields = config.include_evaluable || defaults.evaluable;

  // Copy selected structured fields from parent
  let fileCount = 0;
  for (const field of structuredFields) {
    const srcPath = path.join(agentDir, "structured", `${field}.json`);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(delegateDir, "structured", `${field}.json`));
      fileCount++;
    }
  }

  // Add extra structured fields
  for (const [key, value] of Object.entries(config.extra_structured || {})) {
    fs.writeFileSync(
      path.join(delegateDir, "structured", `${key}.json`),
      JSON.stringify(value, null, 2)
    );
    fileCount++;
  }

  // Copy selected evaluable fields from parent
  for (const field of evaluableFields) {
    const srcPath = path.join(agentDir, "evaluable", `${field}.txt`);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(delegateDir, "evaluable", `${field}.txt`));
      fileCount++;
    }
  }

  // Add extra evaluable fields
  for (const [key, value] of Object.entries(config.extra_evaluable || {})) {
    fs.writeFileSync(path.join(delegateDir, "evaluable", `${key}.txt`), value);
    fileCount++;
  }

  // Write delegate metadata
  const delegateMeta = {
    id: `delegate-${config.purpose}-${crypto.randomUUID().slice(0, 8)}`,
    purpose: config.purpose,
    parent_agent_id: agentId,
    parent_agent_name: mainMeta.name,
    did: `${mainMeta.did}:delegate:${config.purpose}`,
    created_at: new Date().toISOString(),
    file_count: fileCount,
    included_structured: structuredFields,
    included_evaluable: evaluableFields,
  };
  fs.writeFileSync(
    path.join(delegateDir, "metadata.json"),
    JSON.stringify(delegateMeta, null, 2)
  );

  // Generate delegate README
  const readmeLines = [
    `# ${mainMeta.name} — ${config.purpose} delegate`,
    "",
    `**Purpose:** ${config.purpose}`,
    `**Parent:** ${mainMeta.name} (${agentId})`,
    `**Fields included:** ${structuredFields.join(", ")}`,
    "",
    "This is a purpose-scoped projection. It contains only the data relevant to this purpose.",
    "The parent agent's full profile and human_only data are not accessible from here.",
  ];
  fs.writeFileSync(path.join(delegateDir, "README.md"), readmeLines.join("\n"));

  return delegateDir;
}

/**
 * List all delegates for a main agent.
 */
export function listDelegates(baseDir: string, agentId: string): string[] {
  const delegatesDir = path.join(baseDir, "agents", agentId, "delegates");
  if (!fs.existsSync(delegatesDir)) return [];
  return fs.readdirSync(delegatesDir).filter((name) => {
    const stat = fs.statSync(path.join(delegatesDir, name));
    return stat.isDirectory();
  });
}

/**
 * Read a delegate's metadata.
 */
export function readDelegateMetadata(
  baseDir: string,
  agentId: string,
  purpose: string
): Record<string, any> | null {
  const metaPath = path.join(baseDir, "agents", agentId, "delegates", purpose, "metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

/**
 * Delete a specific delegate.
 */
export function deleteDelegate(baseDir: string, agentId: string, purpose: string): void {
  const delegateDir = path.join(baseDir, "agents", agentId, "delegates", purpose);
  if (fs.existsSync(delegateDir)) {
    fs.rmSync(delegateDir, { recursive: true, force: true });
  }
}

/**
 * Get the path to a delegate's directory (for use with createDelegateTools).
 */
export function getDelegatePath(baseDir: string, agentId: string, purpose: string): string {
  return path.join(baseDir, "agents", agentId, "delegates", purpose);
}

/**
 * Create delegate tools scoped to a specific delegate directory.
 * Same as createDelegateTools but pointed at the delegate subdirectory.
 */
export function createDelegateToolsForDelegate(
  baseDir: string,
  agentId: string,
  purpose: string,
  includeTiers: ("structured" | "evaluable")[] = ["structured", "evaluable"]
) {
  const delegateDir = getDelegatePath(baseDir, agentId, purpose);
  if (!fs.existsSync(delegateDir)) {
    throw new Error(`Delegate not found: ${agentId}/${purpose}`);
  }
  // Reuse the same createDelegateTools but pointed at the delegate directory
  // We need to construct a "virtual" agent path
  return createDelegateTools(
    path.join(baseDir, "agents", agentId, "delegates"),
    purpose,
    includeTiers
  );
}

/**
 * Score compatibility between two delegates using file tools.
 */
export function scoreDelegatesViaFileTools(
  baseDir: string,
  agentAId: string,
  purposeA: string,
  agentBId: string,
  purposeB: string
): ReturnType<typeof scoreViaFileTools> {
  // Create tools pointed directly at each delegate's directory
  const delegatePathA = path.join(baseDir, "agents", agentAId, "delegates", purposeA);
  const delegatePathB = path.join(baseDir, "agents", agentBId, "delegates", purposeB);

  if (!fs.existsSync(delegatePathA)) throw new Error(`Delegate not found: ${agentAId}/${purposeA}`);
  if (!fs.existsSync(delegatePathB)) throw new Error(`Delegate not found: ${agentBId}/${purposeB}`);

  // Create tools directly scoped to each delegate directory
  const toolsA = createDelegateToolsDirect(delegatePathA, ["structured", "evaluable"]);
  const toolsB = createDelegateToolsDirect(delegatePathB, ["structured", "evaluable"]);

  const filesRead: string[] = [];

  // Read structured data from both
  const readStructured = (
    tools: ReturnType<typeof createDelegateTools>,
    prefix: string
  ): Record<string, any> => {
    const data: Record<string, any> = {};
    const files = tools.list_files("structured");
    for (const f of files) {
      if (f.type === "file" && f.name.endsWith(".json")) {
        const content = tools.read_file(f.path);
        const key = f.name.replace(".json", "");
        try { data[key] = JSON.parse(content); } catch { data[key] = content; }
        filesRead.push(`${prefix}/${f.path}`);
      }
    }
    return data;
  };

  const structA = readStructured(toolsA, `${agentAId}/${purposeA}`);
  const structB = readStructured(toolsB, `${agentBId}/${purposeB}`);

  filesRead.push(`${agentAId}/${purposeA}/README.md`);
  filesRead.push(`${agentBId}/${purposeB}/README.md`);

  // Read evaluable text
  let aboutA = "", aboutB = "";
  try { aboutA = toolsA.read_file("evaluable/about.txt"); filesRead.push(`${agentAId}/${purposeA}/evaluable/about.txt`); } catch {}
  try { aboutB = toolsB.read_file("evaluable/about.txt"); filesRead.push(`${agentBId}/${purposeB}/evaluable/about.txt`); } catch {}

  const skillsA: string[] = Array.isArray(structA.skills) ? structA.skills : [];
  const skillsB: string[] = Array.isArray(structB.skills) ? structB.skills : [];
  const overlap = skillsA.filter((s) => skillsB.includes(s));
  const uniqueA = skillsA.filter((s) => !skillsB.includes(s));
  const uniqueB = skillsB.filter((s) => !skillsA.includes(s));

  const matchRatio = skillsA.length + skillsB.length > 0
    ? (overlap.length * 2) / (skillsA.length + skillsB.length) : 0;

  const signal: "strong" | "good" | "possible" | "weak" =
    matchRatio >= 0.6 ? "strong" : matchRatio >= 0.3 ? "good" : matchRatio > 0 ? "possible" : "weak";

  const metaA = toolsA.get_metadata();
  const metaB = toolsB.get_metadata();

  return {
    signal,
    matched_on: overlap,
    gaps: [...uniqueA.map((s) => `A has ${s}`), ...uniqueB.map((s) => `B has ${s}`)],
    summary: `${metaA.parent_agent_name || 'A'} (${purposeA}) and ${metaB.parent_agent_name || 'B'} (${purposeB}): ${overlap.length} shared skills (${overlap.join(", ") || "none"}).`.trim(),
    files_read: filesRead,
  };
}

/**
 * Delete an agent's filesystem from disk.
 */
export function deleteAgentFilesystem(
  baseDir: string,
  agentId: string
): void {
  const agentDir = path.join(baseDir, "agents", agentId);
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
}

/**
 * List all agent IDs on disk.
 */
export function listAgentFilesystems(baseDir: string): string[] {
  const agentsDir = path.join(baseDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir).filter((name) => {
    const stat = fs.statSync(path.join(agentsDir, name));
    return stat.isDirectory();
  });
}

/**
 * Read an agent's metadata from disk.
 */
export function readAgentMetadata(
  baseDir: string,
  agentId: string
): Record<string, any> | null {
  const metaPath = path.join(baseDir, "agents", agentId, "metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

// ─── Generate README ──────────────────────────────────────

function generateReadme(config: AgentFilesystemConfig): string {
  const lines: string[] = [];
  lines.push(`# ${config.name}`);
  lines.push("");
  lines.push(`**Purpose:** ${config.purpose}`);
  lines.push("");

  // Structured data summary
  if (config.structured && Object.keys(config.structured).length > 0) {
    lines.push("## Profile");
    for (const [key, value] of Object.entries(config.structured)) {
      if (Array.isArray(value)) {
        lines.push(`- **${key}:** ${value.join(", ")}`);
      } else if (typeof value === "object") {
        lines.push(
          `- **${key}:** ${Object.entries(value)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}`
        );
      } else {
        lines.push(`- **${key}:** ${value}`);
      }
    }
    lines.push("");
  }

  // Evaluable text summary
  if (
    config.evaluable_text &&
    Object.keys(config.evaluable_text).length > 0
  ) {
    lines.push("## About");
    for (const [key, value] of Object.entries(config.evaluable_text)) {
      lines.push(`### ${key}`);
      lines.push(String(value));
      lines.push("");
    }
  }

  // Note about human_only
  if (config.human_only && Object.keys(config.human_only).length > 0) {
    lines.push("---");
    lines.push(
      `*${Object.keys(config.human_only).length} additional file(s) available post-match (human_only tier).*`
    );
  }

  return lines.join("\n");
}

// ─── Delegate Tools ───────────────────────────────────────

/**
 * Create a scoped tool set for a delegate agent.
 *
 * The delegate can ONLY read files from the target agent's directory.
 * It cannot read its own agent's files, the wallet, or anything else.
 *
 * The `includeTiers` parameter controls which tiers are accessible:
 * - For scoring: ["structured", "evaluable"] (human_only excluded)
 * - For post-match human view: ["structured", "evaluable", "human_only"]
 */
export function createDelegateTools(
  baseDir: string,
  targetAgentId: string,
  includeTiers: ("structured" | "evaluable" | "human_only")[] = [
    "structured",
    "evaluable",
  ]
) {
  const targetDir = path.join(baseDir, "agents", targetAgentId);

  // Validate path exists
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Agent filesystem not found: ${targetAgentId}`);
  }

  // Security: resolve the target dir to prevent path traversal
  const resolvedTarget = fs.realpathSync(targetDir);

  function validatePath(requestedPath: string): string {
    const full = path.resolve(resolvedTarget, requestedPath);
    if (!full.startsWith(resolvedTarget)) {
      throw new Error("Access denied: path traversal detected");
    }
    // Check tier access
    const relative = path.relative(resolvedTarget, full);
    const tier = relative.split(path.sep)[0];
    if (
      tier &&
      ["structured", "evaluable", "human_only"].includes(tier) &&
      !includeTiers.includes(tier as any)
    ) {
      throw new Error(`Access denied: ${tier} tier not in scope`);
    }
    return full;
  }

  return {
    /**
     * List files and directories at a path.
     * Like `ls` — shows what's available to browse.
     */
    list_files(relativePath: string = "."): FileEntry[] {
      const full = validatePath(relativePath);
      if (!fs.existsSync(full)) return [];
      const stat = fs.statSync(full);
      if (!stat.isDirectory()) {
        return [
          {
            name: path.basename(full),
            path: relativePath,
            type: "file",
            size: stat.size,
            tier: getTier(relativePath),
          },
        ];
      }
      return fs
        .readdirSync(full)
        .filter((name) => {
          // Filter out tiers not in scope
          if (
            relativePath === "." &&
            ["structured", "evaluable", "human_only"].includes(name)
          ) {
            return includeTiers.includes(name as any);
          }
          return true;
        })
        .map((name) => {
          const filePath = path.join(full, name);
          const fileStat = fs.statSync(filePath);
          return {
            name,
            path: path.join(relativePath, name),
            type: fileStat.isDirectory()
              ? ("directory" as const)
              : ("file" as const),
            size: fileStat.isFile() ? fileStat.size : undefined,
            tier: getTier(path.join(relativePath, name)),
          };
        });
    },

    /**
     * Read a file's contents.
     * Like `cat` — returns the full text of a file.
     */
    read_file(relativePath: string): string {
      const full = validatePath(relativePath);
      if (!fs.existsSync(full)) throw new Error(`File not found: ${relativePath}`);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) throw new Error(`${relativePath} is a directory, not a file`);
      return fs.readFileSync(full, "utf-8");
    },

    /**
     * Search for a string across all accessible files.
     * Like `grep -r` — finds matching lines.
     */
    search(query: string): SearchResult[] {
      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      function searchDir(dir: string, tier: string) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            searchDir(full, tier);
          } else if (stat.isFile()) {
            const content = fs.readFileSync(full, "utf-8");
            const lines = content.split("\n");
            const matches = lines.filter((line) =>
              line.toLowerCase().includes(lowerQuery)
            );
            if (matches.length > 0) {
              results.push({
                file: path.relative(resolvedTarget, full),
                tier,
                matches: matches.slice(0, 5), // max 5 matches per file
              });
            }
          }
        }
      }

      // Search each accessible tier
      for (const tier of includeTiers) {
        searchDir(path.join(resolvedTarget, tier), tier);
      }
      // Also search README.md, but only sections corresponding to included tiers
      // The README contains structured data (always shown) and evaluable text
      // (only if evaluable tier is in scope). We search the whole README only
      // if evaluable is in scope, otherwise just the structured section.
      if (includeTiers.includes("evaluable")) {
        const readmePath = path.join(resolvedTarget, "README.md");
        if (fs.existsSync(readmePath)) {
          const content = fs.readFileSync(readmePath, "utf-8");
          const matches = content
            .split("\n")
            .filter((l) => l.toLowerCase().includes(lowerQuery));
          if (matches.length > 0) {
            results.push({ file: "README.md", tier: "root", matches: matches.slice(0, 5) });
          }
        }
      }

      return results;
    },

    /**
     * Read the agent's README overview.
     * Shortcut for read_file("README.md").
     */
    read_readme(): string {
      return fs.readFileSync(path.join(resolvedTarget, "README.md"), "utf-8");
    },

    /**
     * Get metadata about the agent's filesystem.
     * Like `stat` — shows file counts, sizes, tiers.
     */
    get_metadata(): Record<string, any> {
      const metaPath = path.join(resolvedTarget, "metadata.json");
      if (!fs.existsSync(metaPath)) return { error: "No metadata found" };
      return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    },
  };
}

/**
 * Create delegate tools pointed directly at an absolute directory path.
 * Used for delegates whose path is already resolved.
 */
export function createDelegateToolsDirect(
  absolutePath: string,
  includeTiers: ("structured" | "evaluable" | "human_only")[] = ["structured", "evaluable"]
) {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Directory not found: ${absolutePath}`);
  }

  // Use a temporary structure that createDelegateTools expects
  // by finding the parent and using the directory name as the "agent id"
  const parentDir = path.dirname(absolutePath);
  const dirName = path.basename(absolutePath);

  // Create a virtual "agents" directory structure
  const virtualBase = path.dirname(parentDir);
  const virtualId = path.relative(path.join(virtualBase, "agents"), absolutePath);

  // If the path is already structured as baseDir/agents/id, use createDelegateTools
  // Otherwise, create tools directly with the resolved path
  const resolvedTarget = fs.realpathSync(absolutePath);

  function validatePath(requestedPath: string): string {
    const full = path.resolve(resolvedTarget, requestedPath);
    if (!full.startsWith(resolvedTarget)) {
      throw new Error("Access denied: path traversal detected");
    }
    const relative = path.relative(resolvedTarget, full);
    const tier = relative.split(path.sep)[0];
    if (tier && ["structured", "evaluable", "human_only"].includes(tier) && !includeTiers.includes(tier as any)) {
      throw new Error(`Access denied: ${tier} tier not in scope`);
    }
    return full;
  }

  return {
    list_files(relativePath: string = "."): FileEntry[] {
      const full = validatePath(relativePath);
      if (!fs.existsSync(full)) return [];
      const stat = fs.statSync(full);
      if (!stat.isDirectory()) return [{ name: path.basename(full), path: relativePath, type: "file", size: stat.size, tier: getTier(relativePath) }];
      return fs.readdirSync(full).filter(name => {
        if (relativePath === "." && ["structured", "evaluable", "human_only"].includes(name)) return includeTiers.includes(name as any);
        return true;
      }).map(name => {
        const fp = path.join(full, name);
        const s = fs.statSync(fp);
        return { name, path: path.join(relativePath, name), type: s.isDirectory() ? "directory" as const : "file" as const, size: s.isFile() ? s.size : undefined, tier: getTier(path.join(relativePath, name)) };
      });
    },
    read_file(relativePath: string): string {
      const full = validatePath(relativePath);
      if (!fs.existsSync(full)) throw new Error(`File not found: ${relativePath}`);
      return fs.readFileSync(full, "utf-8");
    },
    search(query: string): SearchResult[] {
      const results: SearchResult[] = [];
      const lq = query.toLowerCase();
      for (const tier of includeTiers) {
        const dir = path.join(resolvedTarget, tier);
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (!fs.statSync(full).isFile()) continue;
          const content = fs.readFileSync(full, "utf-8");
          const matches = content.split("\n").filter(l => l.toLowerCase().includes(lq));
          if (matches.length > 0) results.push({ file: `${tier}/${entry}`, tier, matches: matches.slice(0, 5) });
        }
      }
      return results;
    },
    read_readme(): string {
      const rp = path.join(resolvedTarget, "README.md");
      if (!fs.existsSync(rp)) return "(no README)";
      return fs.readFileSync(rp, "utf-8");
    },
    get_metadata(): Record<string, any> {
      const mp = path.join(resolvedTarget, "metadata.json");
      if (!fs.existsSync(mp)) return { error: "No metadata" };
      return JSON.parse(fs.readFileSync(mp, "utf-8"));
    },
  };
}

function getTier(
  relativePath: string
): "structured" | "evaluable" | "human_only" | "root" {
  const first = relativePath.split(path.sep)[0];
  if (first === "structured") return "structured";
  if (first === "evaluable") return "evaluable";
  if (first === "human_only") return "human_only";
  return "root";
}

// ─── Scoring via File Tools ───────────────────────────────

/**
 * Score compatibility by reading both agents' filesystems via tools.
 *
 * This is what a delegate agent does:
 * 1. Read the other agent's README for an overview
 * 2. List and read their structured/ files for typed data
 * 3. Optionally read evaluable/ files for qualitative assessment
 * 4. Produce a compatibility score
 *
 * In production, this would be an LLM calling these tools.
 * Locally, we do deterministic scoring on the structured data.
 */
export function scoreViaFileTools(
  baseDir: string,
  agentAId: string,
  agentBId: string
): {
  signal: "strong" | "good" | "possible" | "weak";
  matched_on: string[];
  gaps: string[];
  summary: string;
  files_read: string[];
} {
  const toolsForA = createDelegateTools(baseDir, agentAId, [
    "structured",
    "evaluable",
  ]);
  const toolsForB = createDelegateTools(baseDir, agentBId, [
    "structured",
    "evaluable",
  ]);

  const filesRead: string[] = [];

  // Read structured data from both
  const readStructured = (
    tools: ReturnType<typeof createDelegateTools>,
    prefix: string
  ): Record<string, any> => {
    const data: Record<string, any> = {};
    const files = tools.list_files("structured");
    for (const f of files) {
      if (f.type === "file" && f.name.endsWith(".json")) {
        const content = tools.read_file(f.path);
        const key = f.name.replace(".json", "");
        try {
          data[key] = JSON.parse(content);
        } catch {
          data[key] = content;
        }
        filesRead.push(`${prefix}/${f.path}`);
      }
    }
    return data;
  };

  const structA = readStructured(toolsForA, agentAId);
  const structB = readStructured(toolsForB, agentBId);

  // Read READMEs
  filesRead.push(`${agentAId}/README.md`);
  filesRead.push(`${agentBId}/README.md`);

  // Score based on structured data overlap
  const skillsA: string[] = Array.isArray(structA.skills)
    ? structA.skills
    : [];
  const skillsB: string[] = Array.isArray(structB.skills)
    ? structB.skills
    : [];
  const overlap = skillsA.filter((s) => skillsB.includes(s));
  const uniqueA = skillsA.filter((s) => !skillsB.includes(s));
  const uniqueB = skillsB.filter((s) => !skillsA.includes(s));

  // Read evaluable text for summary
  let aboutA = "";
  let aboutB = "";
  try {
    aboutA = toolsForA.read_file("evaluable/about.txt");
    filesRead.push(`${agentAId}/evaluable/about.txt`);
  } catch {}
  try {
    aboutB = toolsForB.read_file("evaluable/about.txt");
    filesRead.push(`${agentBId}/evaluable/about.txt`);
  } catch {}

  const matchRatio =
    skillsA.length + skillsB.length > 0
      ? (overlap.length * 2) / (skillsA.length + skillsB.length)
      : 0;

  const signal: "strong" | "good" | "possible" | "weak" =
    matchRatio >= 0.6
      ? "strong"
      : matchRatio >= 0.3
        ? "good"
        : matchRatio > 0
          ? "possible"
          : "weak";

  const metaA = toolsForA.get_metadata();
  const metaB = toolsForB.get_metadata();

  return {
    signal,
    matched_on: overlap,
    gaps: [...uniqueA.map((s) => `A has ${s}`), ...uniqueB.map((s) => `B has ${s}`)],
    summary: `${metaA.name} and ${metaB.name}: ${overlap.length} shared skills (${overlap.join(", ") || "none"}). ${aboutA ? `A: "${aboutA.slice(0, 80)}..."` : ""} ${aboutB ? `B: "${aboutB.slice(0, 80)}..."` : ""}`.trim(),
    files_read: filesRead,
  };
}
