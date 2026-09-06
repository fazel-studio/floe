/**
 * Floe — Bundle size measurement
 * Run: bun scripts/measure-bundle.ts
 * Reports raw dist bytes per package and writes benchmarks/bundle-size.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

function fileSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}
function dirSize(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fileSize(full);
  }
  return total;
}

const root = process.cwd();
const dist = path.join(root, "dist");

const files: Record<string, string> = {
  "core (dist/src/index.js)": "dist/src/index.js",
  "parser (dist/src/parser.js)": "dist/src/parser.js",
  "lexer (dist/src/lexer.js)": "dist/src/lexer.js",
  "types": "dist/src/types.js",
  "validator": "dist/src/validator.js",
  "layout Simple": "dist/src/layout/simple.js",
  "layout Dagre": "dist/src/layout/dagre.js",
  "renderer SVG": "dist/src/render/svg.js",
  "renderer shapes": "dist/src/render/shapes.js",
  "pipeline": "dist/src/pipeline.js",
  "language services (dist/src/language/)": "dist/src/language",
  "CLI main": "dist/src/cli/main.js",
  "LSP server": "dist/src/lsp/server.js",
  "full dist/": "dist",
};

const sizes: Record<string, { bytes: number; kB: number }> = {};
let totalDist = 0;
for (const [label, rel] of Object.entries(files)) {
  const full = path.join(root, rel);
  const bytes = fs.existsSync(full) && fs.statSync(full).isDirectory() ? dirSize(full) : fileSize(full);
  sizes[label] = { bytes, kB: Math.round(bytes / 1024 * 10) / 10 };
  console.log(`${label}: ${bytes} bytes (${sizes[label].kB} kB)`);
  if (label === "full dist/") totalDist = bytes;
}

const out = {
  date: new Date().toISOString(),
  sizes,
  totalDist,
};

const outPath = path.join(root, "benchmarks", "bundle-size.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
console.log(`Wrote ${outPath}`);
