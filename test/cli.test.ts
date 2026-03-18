import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dirname, "../dist/cli.js");

describe("agentverse CLI", () => {
  it("shows help", () => {
    const output = execFileSync("node", [CLI, "--help"], {
      encoding: "utf-8",
    });
    expect(output).toContain("Privacy-preserving personal profile sharing");
    expect(output).toContain("init");
    expect(output).toContain("extract");
    expect(output).toContain("share");
    expect(output).toContain("wallet");
    expect(output).toContain("discover");
  });

  it("shows version", () => {
    const output = execFileSync("node", [CLI, "--version"], {
      encoding: "utf-8",
    });
    expect(output.trim()).toBe("0.1.0");
  });

  it("discover command shows usage", () => {
    const output = execFileSync("node", [CLI, "discover"], {
      encoding: "utf-8",
    });
    expect(output).toContain("agentverse discover");
  });
});
