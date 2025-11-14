import fs from "node:fs";
import path from "node:path";

/**
 * Entry point for the CLI.
 * Parses simple args and processes files under the target directory.
 */
export async function runCli() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || "src";
  const dryRun = args.includes("--dry-run");

  const fullPath = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    console.error(`[ai-comments] Target path is not a directory: ${fullPath}`);
    process.exit(1);
  }

  const files = collectSourceFiles(fullPath, [".js", ".ts", ".jsx", ".tsx"]);
  if (files.length === 0) {
    console.log("[ai-comments] No source files found to process.");
    return;
  }

  console.log(`[ai-comments] Processing ${files.length} file(s)...`);

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    const updated = await addCommentsToFileContents(original, file);

    if (updated !== original) {
      if (dryRun) {
        console.log(`[ai-comments] (dry-run) Would update: ${file}`);
      } else {
        fs.writeFileSync(file, updated, "utf8");
        console.log(`[ai-comments] Updated: ${file}`);
      }
    }
  }
}

/**
 * Recursively collect files with one of the allowed extensions.
 */
function collectSourceFiles(rootDir, exts) {
  const result = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (exts.includes(ext)) {
          result.push(full);
        }
      }
    }
  }

  walk(rootDir);
  return result;
}

/**
 * Insert AI-generated (currently stubbed) comments above functions without comments.
 * This is intentionally simple; you can later swap the stub with a real LLM call.
 */
export async function addCommentsToFileContents(source, filePath) {
  const lines = source.split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const functionMatch =
      /^function\s+([a-zA-Z0-9_$]+)\s*\(/.exec(trimmed) ||
      /^const\s+([a-zA-Z0-9_$]+)\s*=\s*\(/.exec(trimmed) ||
      /^const\s+([a-zA-Z0-9_$]+)\s*=\s*async\s*\(/.exec(trimmed) ||
      /^const\s+([a-zA-Z0-9_$]+)\s*=\s*\w*\s*=>/.exec(trimmed);

    if (functionMatch) {
      const name = functionMatch[1];
      const prevLine = out[out.length - 1] ?? "";
      const hasCommentAbove = prevLine.trim().startsWith("//") || prevLine.trim().startsWith("/*");

      if (!hasCommentAbove) {
        const snippet = buildSnippet(lines, i);
        const comment = await generateCommentForSnippet(snippet, {
          functionName: name,
          filePath,
        });
        if (comment) {
          const commentLines = String(comment)
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          for (const cLine of commentLines) {
            out.push(`// ${cLine}`);
          }
        }
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

/**
 * Very simple snippet builder: current line + a few that follow.
 */
function buildSnippet(lines, startIndex, maxLines = 8) {
  const snippetLines = [];
  for (let i = startIndex; i < Math.min(lines.length, startIndex + maxLines); i++) {
    snippetLines.push(lines[i]);
  }
  return snippetLines.join("\n");
}

/**
 * Generate a comment for a function snippet.
 * Purely local (no network): uses the function name, parameters,
 * and some simple pattern matching on the body to build a short
 * 1–3 sentence explanation.
 */
export async function generateCommentForSnippet(snippet, meta) {
  return buildHeuristicComment(snippet, meta);
}

/**
 * Heuristic comment generator (no external AI).
 * Tries to describe:
 * - what the function does (from its name),
 * - key side effects (from common patterns in the body),
 * - and how parameters are used.
 */
function buildHeuristicComment(snippet, meta) {
  const { functionName } = meta;
  const name = functionName || "this function";

  // Small heuristics from the name
  const lower = name.toLowerCase();
  let verb = "Handles";
  if (lower.startsWith("get")) verb = "Gets";
  else if (lower.startsWith("set")) verb = "Sets";
  else if (lower.startsWith("create") || lower.startsWith("build")) verb = "Creates";
  else if (lower.startsWith("update")) verb = "Updates";
  else if (lower.startsWith("delete") || lower.startsWith("remove")) verb = "Deletes";
  else if (lower.startsWith("validate")) verb = "Validates";
  else if (lower.startsWith("send")) verb = "Sends";
  else if (lower.startsWith("fetch") || lower.startsWith("load")) verb = "Fetches";
  else if (lower.startsWith("calculate") || lower.startsWith("compute")) verb = "Calculates";

  // Try to guess params from the first line of the snippet
  const firstLine = snippet.split("\n")[0] || "";
  const paramMatch = firstLine.match(/\(([^)]*)\)/);
  const paramsRaw = (paramMatch && paramMatch[1].trim()) || "";
  const params =
    paramsRaw &&
    paramsRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ");
  const paramNames = params
    ? params.split(",").map((p) => p.trim().split(/[:=]/)[0].trim()).filter(Boolean)
    : [];

  const subject = name.replace(/^[a-z]+/, "").replace(/^[_$]/, "") || name;
  const readableSubject = subject
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim() || "the requested operation";

  // Detect common side effects / patterns in the body
  const body = snippet.split("\n").slice(1).join("\n");
  const effects = [];

  if (/\bset[A-Z][a-zA-Z0-9_]*\s*\(/.test(body) || /\bsetState\s*\(/.test(body)) {
    effects.push("updates local state or form fields");
  }
  if (/\breset[A-Z]?[a-zA-Z0-9_]*\s*\(/.test(body) || /\bresetFields?\b/.test(body)) {
    effects.push("resets related fields or state");
  }
  if (/\.closeModal\s*\(/.test(body) || /\bclose\s*\(\)/.test(body) && /modal/i.test(body)) {
    effects.push("closes a modal dialog");
  }
  if (/\.openModal\s*\(/.test(body) || /\bopen\s*\(\)/.test(body) && /modal/i.test(body)) {
    effects.push("opens a modal dialog");
  }
  if (/\bfetch\s*\(/.test(body) || /\baxios\./.test(body) || /\.get\s*\(/.test(body) || /\.post\s*\(/.test(body)) {
    effects.push("performs an HTTP request");
  }
  if (/\bconsole\.log\b/.test(body)) {
    effects.push("logs debug information to the console");
  }

  // Describe how parameters are used, roughly
  const usedParams = [];
  for (const p of paramNames) {
    const paramRegex = new RegExp(`\\b${p}\\b`);
    if (paramRegex.test(body)) {
      usedParams.push(p);
    }
  }

  const sentences = [];

  // Sentence 1: high-level action
  sentences.push(`${verb} ${readableSubject}.`);

  // Sentence 2: side effects if we detected any
  if (effects.length > 0) {
    const effectsText =
      effects.length === 1
        ? effects[0]
        : effects.slice(0, -1).join(", ") + " and " + effects[effects.length - 1];
    sentences.push(`It ${effectsText}.`);
  }

  // Sentence 3: parameter usage
  if (usedParams.length > 0) {
    const paramsText =
      usedParams.length === 1
        ? usedParams[0]
        : usedParams.slice(0, -1).join(", ") + " and " + usedParams[usedParams.length - 1];
    sentences.push(`It uses ${paramsText} as input data.`);
  } else if (paramNames.length > 0) {
    const paramsText =
      paramNames.length === 1
        ? paramNames[0]
        : paramNames.slice(0, -1).join(", ") + " and " + paramNames[paramNames.length - 1];
    sentences.push(`It accepts ${paramsText} to configure the behavior.`);
  }

  return sentences.join(" ");
}
