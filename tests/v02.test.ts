import { describe, it, expect } from "vitest";
import { parseFloe } from "../src/index.js";
import { SimpleLayoutEngine } from "../src/layout/simple.js";
import { DagreLayoutEngine } from "../src/layout/dagre.js";
import { renderSvg } from "../src/render/svg.js";
import { renderFloe } from "../src/pipeline.js";
import type { LayoutEngine } from "../src/layout/types.js";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
const survivingBase = "file:///C:/Users/MyBook%20Hype%20AMD/Documents/Zulfazli/Projects/fazelstudio/floe/dist/src";

describe("v0.2 recovery — API existence", () => {
  it("LayoutEngine interface via SimpleLayoutEngine", () => {
    const e = new SimpleLayoutEngine();
    expect(typeof e.layout).toBe("function");
    const { diagram } = parseFloe("A -> B");
    const res = e.layout(diagram);
    expect(res.nodes).toBeDefined();
    expect(res.edges).toBeDefined();
    expect(res.width).toBeDefined();
  });
  it("DagreLayoutEngine replaceable", () => {
    expect(DagreLayoutEngine).toBeDefined();
    const e = new DagreLayoutEngine();
    expect(typeof e.layout).toBe("function");
  });
  it("renderSvg consumes LayoutResult not raw text", async () => {
    const { diagram } = parseFloe("A -> B");
    const layout = new SimpleLayoutEngine().layout(diagram);
    const svg = renderSvg(layout);
    expect(svg).toContain("<svg");
    // Runtime should fail if raw string passed (type system already prevents, but verify no silent acceptance)
    expect(() => (renderSvg as any)("A -> B")).toThrow();
  });
  it("pipeline renderFloe exists", () => {
    const r = renderFloe("A -> B");
    expect(r.svg).toContain("<svg");
    expect(r.timings).toBeDefined();
    expect(r.sizes).toBeDefined();
  });
});

describe("v0.2 — simple graph", () => {
  it("simple graph layout + SVG", () => {
    const src = "User -> Login\nLogin -> Dashboard";
    const { svg, layoutResult } = renderFloe(src);
    expect(layoutResult.nodes.length).toBe(3);
    expect(layoutResult.edges.length).toBe(2);
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe("v0.2 — directions", () => {
  for (const dir of ["TB","BT","LR","RL"] as const) {
    it(`direction ${dir}`, () => {
      const { layoutResult } = renderFloe(`direction ${dir}\nA -> B\nB -> C`);
      expect(layoutResult.direction).toBe(dir);
      // Spot-check coordinate transform: TB vertical, LR horizontal
      const a = layoutResult.nodes.find(n=>n.id==="A")!;
      const b = layoutResult.nodes.find(n=>n.id==="B")!;
      if (dir==="TB") { expect(a.x).toBe(b.x); expect(a.y).toBeLessThan(b.y); }
      if (dir==="BT") { expect(a.x).toBe(b.x); expect(a.y).toBeGreaterThan(b.y); }
      if (dir==="LR") { expect(a.y).toBe(b.y); expect(a.x).toBeLessThan(b.x); }
      if (dir==="RL") { expect(a.y).toBe(b.y); expect(a.x).toBeGreaterThan(b.x); }
    });
  }
});

describe("v0.2 — labels", () => {
  it("node types with labels", () => {
    const src = "User [person]\nAPI [service]\nDB [database]\nClient [client]\nUser -> API\nAPI -> DB";
    const { svg, layoutResult } = renderFloe(src);
    expect(layoutResult.nodes.find(n=>n.id==="User")?.type).toBe("person");
    expect(layoutResult.nodes.find(n=>n.id==="DB")?.type).toBe("database");
    // Distinct shapes: database uses ellipse, others rect
    expect(svg).toContain("<ellipse"); // database cylinder
    expect(svg).toContain("User"); expect(svg).toContain("API");
  });
  it("edge labels", () => {
    const src = "A -> B : hello\nB -> C : world";
    const { svg, layoutResult } = renderFloe(src);
    const labels = layoutResult.edges.map(e=>e.label).sort();
    expect(labels).toContain("hello");
    expect(labels).toContain("world");
    expect(svg).toContain("hello"); expect(svg).toContain("world");
    // label background rect + escaped?
    expect(svg).toContain('class="edge-label"');
  });
  it("edge label escaping", () => {
    const src = "A -> B : hello & world <test>";
    const { svg } = renderFloe(src);
    expect(svg).toContain("hello &amp; world &lt;test&gt;");
    expect(svg).not.toContain("hello & world <test></text>");
  });
});

describe("v0.2 — malformed input", () => {
  it("does not throw, produces best-effort SVG", () => {
    const src = "A -> B :\nUser [person]\nUser [service]\nA ->\n-> Login\nCache -- Database : sync";
    // Note: "--" is v1 undirected, v0.1/0.2 trimmed parser will treat as error but should not throw
    expect(() => renderFloe(src)).not.toThrow();
    const { parseResult, svg } = renderFloe(src);
    expect(parseResult.diagnostics.length).toBeGreaterThan(0);
    expect(svg).toContain("<svg"); expect(svg).toContain("</svg>");
  });
});

describe("v0.2 — deterministic output", () => {
  it("same source + config -> identical SVG", () => {
    const src = "direction LR\nUser -> API : req\nAPI -> DB : query\nDB -> Client";
    const a = renderFloe(src).svg;
    const b = renderFloe(src).svg;
    expect(a).toBe(b);
    const { diagram } = parseFloe(src);
    const e = new SimpleLayoutEngine();
    const l1 = e.layout(diagram);
    const l2 = e.layout(diagram);
    expect(l1).toEqual(l2);
  });
  it("no random IDs/timestamps/seeds", () => {
    const src = "A -> B\nB -> C";
    const svg = renderFloe(src).svg;
    expect(svg).not.toMatch(/Math\.random/);
    expect(svg).not.toMatch(/\d{13}/); // rough timestamp
    // deterministic marker id
    expect(svg).toContain('id="arrowhead"');
    expect(svg).not.toContain("NaN");
  });
});

describe("v0.2 — SVG structural validity", () => {
  it("valid SVG structure", () => {
    const src = "A -> B\nB -> C\nA -> C";
    const { svg } = renderFloe(src);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<defs>"); expect(svg).toContain('marker id="arrowhead"');
    expect(svg).toContain('<g class="edges"');
    expect(svg).toContain('<g class="nodes"');
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    // deterministic ordering: nodes sorted
    const nodeIds = [...svg.matchAll(/id="node-([^"]+)"/g)].map(m=>m[1]);
    expect(nodeIds).toEqual([...nodeIds].sort());
  });
  it("undirected vs directed edge handling (if v1 superset, dasharray)", async () => {
    // Surviving svg.js renders undirected as stroke-dasharray and no marker
    // Our reconstruction should preserve that via e.data?.kind
    // Simulate via synthetic diagram with undirected kind
    const { diagram } = parseFloe("A -> B");
    // Manually inject undirected edge via diagram copy
    const diagAny = diagram as any;
    diagAny.edges[0].kind = "undirected";
    const layout = new SimpleLayoutEngine().layout(diagram);
    const svg = renderSvg(layout);
    expect(svg).toContain('stroke-dasharray="6 3"');
    expect(svg).not.toContain('marker-end="url(#arrowhead)"'); // for that edge, but we have only one edge, so check not contains marker? Actually svg still has marker def but edge shouldn't have marker
    // Directed case should have marker
    const diag2 = parseFloe("A -> B").diagram;
    (diag2.edges[0] as any).kind = "directed";
    const svg2 = renderSvg(new SimpleLayoutEngine().layout(diag2));
    expect(svg2).toContain('marker-end="url(#arrowhead)"');
  });
});

describe("v0.2 — larger graphs", () => {
  it("50-node chain", () => {
    let src=""; for(let i=0;i<50;i++) src+=`N${i} -> N${i+1}\n`;
    const { layoutResult, svg, timings, sizes } = renderFloe(src);
    expect(layoutResult.nodes.length).toBe(51);
    expect(layoutResult.edges.length).toBe(50);
    expect(svg.length).toBeGreaterThan(2000);
    expect(timings.parseMs).toBeGreaterThanOrEqual(0);
    expect(sizes.nodeCount).toBe(51);
  });
  it("diamond branching centered", () => {
    const src = "A -> B\nA -> C\nB -> D\nC -> D";
    const { layoutResult } = renderFloe(src);
    const b = layoutResult.nodes.find(n=>n.id==="B")!, c = layoutResult.nodes.find(n=>n.id==="C")!;
    expect(b.y).toBe(c.y);
    expect(b.x).not.toBe(c.x);
  });
});

describe("v0.2 — comparison vs surviving compiled implementation", () => {
  // Helper that uses child_process + pathToFileURL to avoid Vite import issues with Windows spaces
  function runSurvivingLayoutComparison(src: string): any {
    const distBase = "C:/Users/MyBook Hype AMD/Documents/Zulfazli/Projects/fazelstudio/floe/dist/src";
    const scriptPath = path.resolve(process.cwd(), "tmp_surv_layout.mjs");
    const distIndexUrl = pathToFileURL(path.resolve(distBase, "index.js")).href;
    const distSimpleUrl = pathToFileURL(path.resolve(distBase, "layout/simple.js")).href;
    const content = `
import { parseFloe } from "${distIndexUrl}";
import { SimpleLayoutEngine } from "${distSimpleUrl}";
const src = ${JSON.stringify(src)};
const { diagram } = parseFloe(src);
const e = new SimpleLayoutEngine();
const lay = e.layout(diagram);
console.log(JSON.stringify({
  direction: lay.direction,
  nodes: lay.nodes.map(n=>({id:n.id,x:n.x,y:n.y})).sort((a,b)=>a.id.localeCompare(b.id)),
  edges: lay.edges.length,
  groups: (lay.groups||[]).length
}));
`;
    fs.writeFileSync(scriptPath, content, "utf-8");
    const out = execSync(`node "${scriptPath}"`, { encoding: "utf-8" });
    try { fs.unlinkSync(scriptPath); } catch {}
    return JSON.parse(out);
  }

  function runSurvivingSvgComparison(src: string): any {
    const distBase = "C:/Users/MyBook Hype AMD/Documents/Zulfazli/Projects/fazelstudio/floe/dist/src";
    const scriptPath = path.resolve(process.cwd(), "tmp_surv_svg.mjs");
    const distIndexUrl = pathToFileURL(path.resolve(distBase, "index.js")).href;
    const distSimpleUrl = pathToFileURL(path.resolve(distBase, "layout/simple.js")).href;
    const distRenderUrl = pathToFileURL(path.resolve(distBase, "render/svg.js")).href;
    const content = `
import { parseFloe } from "${distIndexUrl}";
import { SimpleLayoutEngine } from "${distSimpleUrl}";
import { renderSvg } from "${distRenderUrl}";
const src = ${JSON.stringify(src)};
const { diagram } = parseFloe(src);
const lay = new SimpleLayoutEngine().layout(diagram);
const svg = renderSvg(lay);
console.log(JSON.stringify({ len: svg.length, hasPerson: svg.includes("#fef3c7"), hasArrow: svg.includes('id="arrowhead"') }));
`;
    fs.writeFileSync(scriptPath, content, "utf-8");
    const out = execSync(`node "${scriptPath}"`, { encoding: "utf-8" });
    try { fs.unlinkSync(scriptPath); } catch {}
    return JSON.parse(out);
  }

  it("SimpleLayoutEngine output semantically equivalent to surviving simple.js", () => {
    const src = "direction TB\nA -> B\nB -> C\nA -> C";
    const rec = renderFloe(src);
    const surv = runSurvivingLayoutComparison(src);
    expect(rec.layoutResult.nodes.map(n=>n.id).sort()).toEqual(surv.nodes.map((n:any)=>n.id).sort());
    expect(rec.layoutResult.direction).toBe(surv.direction);
    expect(rec.layoutResult.edges.length).toBe(surv.edges);
    for (const n of rec.layoutResult.nodes) {
      const s = surv.nodes.find((x:any)=>x.id===n.id);
      expect(s).toBeDefined();
      expect(Math.abs(s!.x - n.x)).toBeLessThan(0.01);
      expect(Math.abs(s!.y - n.y)).toBeLessThan(0.01);
    }
  });

  it("svg output structurally equivalent to surviving render/svg.js", () => {
    const src = "User [person]\nAPI [service]\nDB [database]\nUser -> API : req\nAPI -> DB";
    const recSvg = renderFloe(src).svg;
    const surv = runSurvivingSvgComparison(src);
    expect(recSvg).toContain('id="arrowhead"');
    expect(surv.hasArrow).toBe(true);
    expect(recSvg).toContain("#fef3c7");
    expect(surv.hasPerson).toBe(true);
    const ratio = Math.abs(recSvg.length - surv.len) / surv.len;
    expect(ratio).toBeLessThan(0.15);
  });

  it("groups rendering if present (v1 superset)", () => {
    const distBase = "C:/Users/MyBook Hype AMD/Documents/Zulfazli/Projects/fazelstudio/floe/dist/src";
    const scriptPath = path.resolve(process.cwd(), "tmp_surv_group.mjs");
    const distIndexUrl = pathToFileURL(path.resolve(distBase, "index.js")).href;
    const distSimpleUrl = pathToFileURL(path.resolve(distBase, "layout/simple.js")).href;
    const distRenderUrl = pathToFileURL(path.resolve(distBase, "render/svg.js")).href;
    const content = `
import { parseFloe } from "${distIndexUrl}";
import { SimpleLayoutEngine } from "${distSimpleUrl}";
import { renderSvg } from "${distRenderUrl}";
const src = "group Backend {\\n  A -> B\\n  B -> C\\n}\\nA -> C";
const res = parseFloe(src);
let groupsLen = res.diagram.groups?.length ?? 0;
let recGroups = 0, hasGroupRender = false;
if (groupsLen>0) {
  const lay = new SimpleLayoutEngine().layout(res.diagram);
  recGroups = lay.groups?.length ?? 0;
  const svg = renderSvg(lay);
  hasGroupRender = svg.includes('class="groups"');
}
console.log(JSON.stringify({ groupsLen, recGroups, hasGroupRender }));
`;
    fs.writeFileSync(scriptPath, content, "utf-8");
    const out = execSync(`node "${scriptPath}"`, { encoding: "utf-8" });
    try { fs.unlinkSync(scriptPath); } catch {}
    const parsed = JSON.parse(out);
    if (parsed.groupsLen>0) {
      expect(parsed.recGroups).toBeGreaterThan(0);
      expect(parsed.hasGroupRender).toBe(true);
    } else {
      // Fallback: synthetic group via recovered engine
      const diag: any = parseFloe("A -> B").diagram;
      diag.groups = [{ id:"G", label:"G", range: {start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}}, nodeIds:["A"], groups:[], metadata:{}, annotations:[], link: undefined }];
      const lay = new SimpleLayoutEngine().layout(diag);
      expect(lay.groups?.length).toBe(1);
      const svg = renderSvg(lay as any);
      expect(svg).toContain('id="group-G"');
    }
  });
});

describe("v0.2 — security: no eval, no injection", () => {
  it("no eval/new Function in source", async () => {
    const fs = await import("node:fs");
    const files = ["src/layout/simple.ts","src/layout/dagre.ts","src/render/svg.ts","src/render/shapes.ts","src/pipeline.ts"];
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      expect(content).not.toMatch(/\beval\s*\(/);
      expect(content).not.toMatch(/\bnew\s+Function\s*\(/);
    }
  });
  it("escaping prevents injection", () => {
    const src = `A -> B : <script>alert(1)</script> & test`;
    const { svg } = renderFloe(src);
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&amp; test");
  });
});

describe("v0.2 — layout replaceability", () => {
  it("custom engine works", () => {
    const custom: LayoutEngine = {
      layout(diagram) {
        return {
          diagram,
          direction: diagram.direction,
          nodes: diagram.nodes.map((n,i)=>({ id:n.id, label:n.label??n.id, type:n.type, x:100+i*10, y:100+i*10, width:80, height:40, data:n })),
          edges: diagram.edges.map(e=>({ source:e.source, target:e.target, label:e.label, points:[{x:0,y:0},{x:100,y:100}], data:e })),
          width:300,height:300,
        };
      }
    };
    const { layoutResult, svg } = renderFloe("A -> B\nB -> C", { layoutEngine: custom });
    expect(layoutResult.nodes[0]!.x).toBe(100);
    expect(svg).toContain("<svg");
    // default still different
    const def = renderFloe("A -> B\nB -> C");
    expect(def.layoutResult.nodes[0]!.x).not.toBe(100);
  });
});
