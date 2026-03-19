// @ts-nocheck
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { AGENTVERSE_DIR } from "./init.js";

export const demoCommand = new Command("demo")
  .description("Run the full Agentverse demo: init → extract → issue → serve → match")
  .option("--port <port>", "Port for the local server", "3000")
  .option("--skip-extract", "Skip extraction (use sample data)")
  .action(async (options) => {
    const port = parseInt(options.port);

    console.log("\n  ╔══════════════════════════════════════════╗");
    console.log("  ║         AGENTVERSE DEMO                  ║");
    console.log("  ║   Privacy-Preserving Agent Matching       ║");
    console.log("  ╚══════════════════════════════════════════╝\n");

    // Step 1: Init
    console.log("  Step 1: Initializing wallet...");
    if (!fs.existsSync(AGENTVERSE_DIR)) {
      fs.mkdirSync(AGENTVERSE_DIR, { recursive: true, mode: 0o700 });
    }

    const { generateMasterKeyPair, createDidDocument } = await import("../wallet/keys.js");
    const { exported } = await generateMasterKeyPair();
    const didDoc = createDidDocument(exported.publicKeyMultibase);
    console.log(`    DID: ${didDoc.id}`);
    console.log(`    Keys: BLS12-381 (BBS+ signing)`);

    // Step 2: Start server with demo agents
    console.log("\n  Step 2: Starting local server...\n");

    const { startLocalServer } = await import("../local-server/api.js");
    const server = await startLocalServer({
      name: "Agentverse Demo",
      did: didDoc.id,
      open_to: ["recruiting", "cofounder", "dating"],
      port,
    });

    console.log(`    Dashboard: http://localhost:${port}`);
    console.log(`    API:       http://localhost:${port}/api/`);

    // Step 3: Create sample agents
    console.log("\n  Step 3: Creating demo agents...\n");

    const demoAgents = [
      {
        name: "Alice", purpose: "cofounder",
        skills: ["rust", "cryptography", "distributed-systems", "typescript"],
        experienceBand: "5-10yr",
        evaluable_text: { about: "Built payment infrastructure at Stripe for 6 years. Led a team of 5 engineers on real-time payment processing serving 10M transactions/day. Passionate about privacy-preserving technology.", vision: "Building the privacy layer for AI agents — a protocol where agents discover and match without exposing raw data." },
        human_only: { notes: "Looking for business-focused cofounder who can handle fundraising and GTM", compensation: "Taking no salary for 12 months" },
      },
      {
        name: "Bob", purpose: "cofounder",
        skills: ["product-management", "fundraising", "go-to-market", "strategy"],
        experienceBand: "5-10yr",
        evaluable_text: { about: "Former VP Product at Plaid. Raised Series A ($12M) for previous startup. Deep expertise in developer tools and API-first products.", vision: "Looking for a deep technical cofounder to build the next platform company in the AI agent space." },
        human_only: { notes: "Have $500K committed from angels, need technical cofounder", compensation: "Can bootstrap for 18 months" },
      },
      {
        name: "Carol", purpose: "recruiting",
        skills: ["python", "machine-learning", "pytorch", "data-engineering"],
        experienceBand: "3-5yr",
        evaluable_text: { about: "ML engineer at DeepMind. Published 3 papers on transformer architectures. Built production recommendation systems serving 50M users." },
        human_only: { notes: "Open to senior ML roles at startups", compensation: "180-220K + equity" },
      },
      {
        name: "Dave", purpose: "recruiting",
        skills: ["rust", "go", "kubernetes", "distributed-systems", "aws"],
        experienceBand: "5-10yr",
        evaluable_text: { about: "Senior infrastructure engineer at Cloudflare. Migrated 200 services to Kubernetes. Expert in high-availability distributed systems." },
        human_only: { notes: "Looking for Staff+ roles, remote only", compensation: "200-250K" },
      },
    ];

    for (const agent of demoAgents) {
      const r = await fetch(`http://localhost:${port}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      });
      const d = await r.json();
      console.log(`    + ${agent.name} (${agent.purpose}) — ${agent.skills.join(", ")}`);
    }

    // Step 4: Run matching
    console.log("\n  Step 4: Running file-based matching...\n");

    const matchRes = await fetch(`http://localhost:${port}/api/matches/run`, { method: "POST" });
    const matchData = await matchRes.json();
    console.log(`    ${matchData.matches_created} matches found:`);
    for (const m of matchData.matches) {
      console.log(`    ${m.agent_a} ↔ ${m.agent_b}: ${m.signal_ab} (matched: ${m.matched_on.join(", ") || "purpose"}) [${m.method}]`);
    }

    // Step 5: Optionally run LLM agents
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      console.log("\n  Step 5: Running LLM delegate agents (this takes ~30-60s)...\n");

      const matches = await fetch(`http://localhost:${port}/api/matches`).then(r => r.json());
      const firstMatch = matches.matches[0];
      if (firstMatch) {
        console.log(`    Evaluating: ${firstMatch.agent_a.name} ↔ ${firstMatch.agent_b.name}`);
        console.log(`    Each agent browses the other's filesystem with 7 tools...`);

        const evalRes = await fetch(`http://localhost:${port}/api/matches/${firstMatch.id}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const evalData = await evalRes.json();
        const s = evalData.summary;

        console.log(`\n    ${s.agent_a.name}: ${s.agent_a.decision} (${s.agent_a.confidence}%)`);
        console.log(`      "${s.agent_a.reasoning}"`);
        console.log(`      ${s.agent_a.tool_calls} tool calls, ${s.agent_a.files_read} files read, ${(s.agent_a.duration_ms / 1000).toFixed(1)}s`);

        console.log(`\n    ${s.agent_b.name}: ${s.agent_b.decision} (${s.agent_b.confidence}%)`);
        console.log(`      "${s.agent_b.reasoning}"`);
        console.log(`      ${s.agent_b.tool_calls} tool calls, ${s.agent_b.files_read} files read, ${(s.agent_b.duration_ms / 1000).toFixed(1)}s`);

        console.log(`\n    Mutual match: ${s.mutual_accept ? "YES" : "NO"}`);

        if (evalData.match?.reveal?.a_human_only) {
          console.log(`\n    Revealed private data:`);
          console.log(`      ${firstMatch.agent_a.name}: ${JSON.stringify(evalData.match.reveal.a_human_only)}`);
          console.log(`      ${firstMatch.agent_b.name}: ${JSON.stringify(evalData.match.reveal.b_human_only)}`);
        }
      }
    } else {
      console.log("\n  Step 5: Skipping LLM agents (no ANTHROPIC_API_KEY set)");
      console.log("    Set ANTHROPIC_API_KEY in .env to enable LLM-powered agent evaluation");
    }

    console.log("\n  ──────────────────────────────────────────");
    console.log(`\n  Dashboard ready at: http://localhost:${port}`);
    console.log("  Press Ctrl+C to stop.\n");
  });
