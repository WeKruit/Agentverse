#!/usr/bin/env node
// @ts-nocheck
import { runBbsPoc } from "./wallet/bbs-poc.js";

runBbsPoc().catch((err) => {
  console.error("BBS+ PoC FAILED:", err);
  process.exit(1);
});
