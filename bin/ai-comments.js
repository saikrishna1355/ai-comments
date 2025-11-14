#!/usr/bin/env node
import { runCli } from "../src/index.js";

runCli().catch((error) => {
  console.error("[ai-comments] Error:", error?.message || error);
  process.exit(1);
});

