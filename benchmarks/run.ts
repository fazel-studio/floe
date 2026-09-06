/**
 * Floe v1.0 — Benchmark harness
 * Run: bun benchmarks/run.ts
 * Measures parsing, layout, render, pipeline and editor operations with performance.now()
 * Writes benchmarks/results.json
 */
import { performance } from "node:perf_hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseFloe } from "../src/index.js";
import { SimpleLayoutEngine } from "../src/layout/simple.js";
import { renderSvg } from "../src/render/svg.js";
import { renderFloe } from "../src/pipeline.js";
import { getDiagnostics } from "../src/language/diagnosticsService.js";
import { getCompletions } from "../src/language/completion.js";
import { getHover } from "../src/language/hover.js";
import { format } from "../src/language/formatting.js";
import { getSymbols } from "../src/language/symbols.js";

function measure(fn: () => void, iterations = 200) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { avg: round3(avg), min: round3(min), max: round3(max), iterations };
}
function round3(n: number) { return Math.round(n * 1000) / 1000; }

function genChain(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += `N${i} -> N${i + 1}\n`;
  return s;
}
function genChainWithLabels(n: number): string {
  // for medium etc similar to corpus, but simple chain is deterministic
  return genChain(n);
}

const samples = {
  tiny: { source: "A -> B\n", chars: 6, edges: 1 },
  small: { source: genChain(10), chars: 90, edges: 10 },
  medium: { source: genChain(50), chars: 530, edges: 50 },
  large: { source: genChain(500), chars: 6281, edges: 500 },
  xlarge: { source: genChain(1000), chars: 12782, edges: 1000 },
};

const bunVersion = (globalThis as any).Bun?.version ?? "unknown";
const results: any = {
  date: new Date().toISOString(),
  env: `Bun ${bunVersion} — Node compat ${process.version} — ${process.platform} ${process.arch}`,
  samples: {} as any,
  editor: {} as any,
  scaling: [] as any[],
  sizes: {} as any,
};

console.log("Floe Benchmark — measuring...");

// Samples: parseFloe, SimpleLayout, renderSvg, full pipeline
for (const [name, s] of Object.entries(samples)) {
  const src = s.source;
  const diagram = parseFloe(src).diagram;
  const engine = new SimpleLayoutEngine();
  const layout = engine.layout(diagram);
  const parse = measure(() => parseFloe(src), 200);
  const layoutM = measure(() => new SimpleLayoutEngine().layout(diagram), 200);
  const render = measure(() => renderSvg(layout), 200);
  const pipeline = measure(() => renderFloe(src), 200);
  results.samples[name] = {
    chars: s.chars,
    edges: s.edges,
    parseFloe: parse,
    layout: layoutM,
    render: render,
    pipeline: pipeline,
  };
  console.log(`${name}: parse ${parse.avg}ms layout ${layoutM.avg}ms render ${render.avg}ms pipeline ${pipeline.avg}ms`);
}

// Editor operations for 50-node sample over 500 iterations
{
  const src50 = genChain(50);
  const offset = src50.indexOf("N25");
  results.editor = {
    diagnostics: measure(() => getDiagnostics(src50), 500),
    completion: measure(() => getCompletions(src50, offset), 500),
    hover: measure(() => getHover(src50, offset), 500),
    formatting: measure(() => format(src50), 500),
    symbols: measure(() => getSymbols(src50), 500),
  };
  console.log("editor ops:", results.editor);
}

// Large scaling single run
for (const n of [100, 500, 1000, 2000]) {
  const src = genChain(n);
  const t0 = performance.now();
  const pr = parseFloe(src);
  const t1 = performance.now();
  const eng = new SimpleLayoutEngine();
  const lr = eng.layout(pr.diagram);
  const t2 = performance.now();
  const svg = renderSvg(lr);
  const t3 = performance.now();
  const parseMs = round3(t1 - t0);
  const layoutMs = round3(t2 - t1);
  const renderMs = round3(t3 - t2);
  const totalMs = round3(t3 - t0);
  const svgSize = svg.length;
  results.scaling.push({ n, edges: n, nodes: n + 1, parse: parseMs, layout: layoutMs, render: renderMs, svgSize, total: totalMs });
  console.log(`scaling n=${n}: parse ${parseMs} layout ${layoutMs} render ${renderMs} svg ${Math.round(svgSize/1024)}kB total ${totalMs}ms`);
}

// Guards per performance.md
for (const row of results.scaling) {
  if (row.n === 500) {
    if (row.parse > 100) console.warn(`WARN: 500 nodes parse ${row.parse}ms > 100ms guard`);
    if (row.layout > 200) console.warn(`WARN: 500 nodes layout ${row.layout}ms > 200ms guard`);
    if (row.render > 100) console.warn(`WARN: 500 nodes render ${row.render}ms > 100ms guard`);
  }
}

const outPath = path.join(process.cwd(), "benchmarks", "results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
console.log(`Wrote ${outPath}`);

// Also update bundle-size via measure logic? Keep separate script, but also emit sizes here for convenience
