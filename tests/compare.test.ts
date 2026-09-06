import { describe, it, expect } from "vitest";
import { parseFloe as parseReconstructed } from "../src/index.js";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

function parseSurvivingViaTemp(source: string): any {
  const scriptPath = path.resolve(process.cwd(), "tmp_surviving_check.mjs");
  const distPath = path.resolve("C:/Users/MyBook Hype AMD/Documents/Zulfazli/Projects/fazelstudio/floe/dist/src/index.js");
  const distUrl = pathToFileURL(distPath).href;
  const content = `
import { parseFloe } from "${distUrl}";
const src = ${JSON.stringify(source)};
const res = parseFloe(src);
const out = {
  direction: res.diagram.direction,
  nodes: res.diagram.nodes.map(n => ({ id: n.id, type: n.type || null })).sort((a,b)=>a.id.localeCompare(b.id)),
  edges: res.diagram.edges.map(e => ({ source: e.source, target: e.target, label: e.label || null })).sort((a,b)=> (a.source+a.target).localeCompare(b.source+b.target)),
  diagnostics: res.diagnostics.map(d => d.code).sort()
};
console.log(JSON.stringify(out));
`;
  fs.writeFileSync(scriptPath, content, "utf-8");
  const out = execSync(`node "${scriptPath}"`, { encoding: "utf-8" });
  try { fs.unlinkSync(scriptPath); } catch {}
  return JSON.parse(out);
}

function normalizeReconstructed(source: string): any {
  const res = parseReconstructed(source);
  return {
    direction: res.diagram.direction,
    nodes: res.diagram.nodes.map(n => ({ id: n.id, type: n.type || null })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: res.diagram.edges.map(e => ({ source: e.source, target: e.target, label: e.label || null })).sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target)),
    diagnostics: res.diagnostics.map(d => d.code).sort(),
  };
}

describe("comparison: reconstructed vs surviving (v0.1 subset + v0.3 extensions)", () => {
  const cases = [
    "User -> Login\nLogin -> Dashboard",
    "API [service]\nDatabase [database]",
    "User -> Login : authenticate",
    "direction LR\nA -> B",
    "// comment\nUser -> Login",
    "User -> Login\nLogin -> Dashboard : success\nLogin -> Error : invalid",
    "User [person]\nUser [service]",
    "direction XX",
    "123User -> Login",
    "",
    "Cache -- Database : sync",
    'API [service] "API Gateway"',
    "group Backend {\n  API\n  Database\n}",
    'meta author = "Alice"',
    'note "global"',
  ];
  for (const src of cases) {
    it(`matches for ${JSON.stringify(src).slice(0, 40)}`, () => {
      const expected = parseSurvivingViaTemp(src);
      const actual = normalizeReconstructed(src);
      expect(actual).toEqual(expected);
    });
  }
  it("v0.3: undirected -- is valid in both (no divergence)", () => {
    const src = "Cache -- Database : sync";
    const surviving = parseSurvivingViaTemp(src);
    const reconstructed = normalizeReconstructed(src);
    expect(surviving.diagnostics).toHaveLength(0);
    expect(reconstructed.diagnostics).toHaveLength(0);
  });
});
