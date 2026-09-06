// @ts-nocheck
/**
 * Floe v0.3 — Language Features Tests
 * Validates reconstructed v1.0 behavior from surviving dist artifacts.
 * Covers: groups, nested groups, display labels, metadata, node types,
 * edge semantics (--), annotations, links, style refs, IR, validation, formatter, renderer.
 */
import { describe, it, expect } from "vitest";
import { parseFloe } from "../src/index.js";
import { tokenize } from "../src/lexer.js";

describe("Floe v0.3 — Groups", () => {
  it("parses simple group", () => {
    const { diagram, diagnostics } = parseFloe("group Backend {\n API\n Database\n Cache\n}");
    expect(diagnostics.filter(d=>d.severity==="error")).toHaveLength(0);
    expect(diagram.groups).toHaveLength(1);
    expect(diagram.groups[0]!.id).toBe("Backend");
    expect(diagram.groups[0]!.nodeIds.sort()).toEqual(["API","Cache","Database"]);
    expect(diagram.nodes.map(n=>n.id).sort()).toEqual(["API","Cache","Database"]);
  });

  it("parses group with type and label", () => {
    const { diagram } = parseFloe('group Backend [subsystem] "Backend Services" {\n API [service] "Gateway"\n}');
    const g = diagram.groups[0]!;
    expect(g.type).toBe("subsystem");
    expect(g.label).toBe("Backend Services");
    const api = diagram.nodes.find(n=>n.id==="API")!;
    expect(api.type).toBe("service");
    expect(api.label).toBe("Gateway");
  });

  it("supports nested groups", () => {
    const { diagram } = parseFloe("group A {\n group B {\n X\n }\n Y\n}");
    expect(diagram.groups).toHaveLength(1);
    const a = diagram.groups[0]!;
    expect(a.id).toBe("A");
    expect(a.nodeIds).toEqual(["Y"]);
    expect(a.groups).toHaveLength(1);
    expect(a.groups[0]!.id).toBe("B");
    expect(a.groups[0]!.nodeIds).toEqual(["X"]);
    expect(a.groups[0]!.parentId).toBe("A");
  });

  it("validates duplicate group id E011", () => {
    const { diagnostics } = parseFloe("group A { X }\ngroup A { Y }");
    expect(diagnostics.some(d=>d.code==="E011")).toBe(true);
  });

  it("validates unclosed group E012", () => {
    const { diagnostics } = parseFloe("group A { X");
    expect(diagnostics.some(d=>d.code==="E012")).toBe(true);
  });

  it("parses same-line group", () => {
    const { diagram, diagnostics } = parseFloe("group A { X }");
    expect(diagnostics.filter(d=>d.severity==="error")).toHaveLength(0);
    expect(diagram.groups[0]!.nodeIds).toEqual(["X"]);
  });
});

describe("Floe v0.3 — Display Labels", () => {
  it("parses node with display label", () => {
    const { diagram } = parseFloe('API [service] "API Gateway"');
    expect(diagram.nodes[0]!.label).toBe("API Gateway");
    expect(diagram.nodes[0]!.type).toBe("service");
  });

  it("parses group label", () => {
    const { diagram } = parseFloe('group G "My Group" { }');
    expect(diagram.groups[0]!.label).toBe("My Group");
  });

  it("validates empty display label E010", () => {
    const { diagnostics } = parseFloe('API ""');
    expect(diagnostics.some(d=>d.code==="E010")).toBe(true);
  });

  it("handles escapes in string", () => {
    const toks = tokenize('API "a \\"b\\""');
    expect(toks.find(t=>t.type==="STRING")!.lexeme).toBe('a "b"');
  });
});

describe("Floe v0.3 — Edge Semantics", () => {
  it("parses directed -> and undirected --", () => {
    const { diagram } = parseFloe("A -> B\nA -- B");
    expect(diagram.edges[0]!.kind).toBe("directed");
    expect(diagram.edges[1]!.kind).toBe("undirected");
  });

  it("supports -- without spaces (A--B)", () => {
    const toks = tokenize("A--B");
    expect(toks.map(t=>t.type)).toEqual(["IDENT","DASHDASH","IDENT","EOF"]);
    const { diagram } = parseFloe("A--B");
    expect(diagram.edges[0]!.kind).toBe("undirected");
  });

  it("supports edge labels for both kinds", () => {
    const { diagram } = parseFloe("A -- B : assoc\nA -> B : \"hello\"");
    expect(diagram.edges[0]!.label).toBe("assoc");
    expect(diagram.edges[1]!.label).toBe("hello");
  });

  it("surviving fixture Cache -- Database valid", () => {
    const { diagram, diagnostics } = parseFloe("Cache -- Database : sync");
    expect(diagnostics.filter(d=>d.severity==="error")).toHaveLength(0);
    expect(diagram.edges[0]!.kind).toBe("undirected");
  });
});

describe("Floe v0.3 — Metadata", () => {
  it("parses diagram metadata", () => {
    const { diagram } = parseFloe('meta author = "Alice"\nA -> B');
    expect(diagram.metadata).toEqual({ author: "Alice" });
  });

  it("parses group metadata", () => {
    const { diagram } = parseFloe('group G {\n meta key = "val"\n A\n}');
    expect(diagram.groups[0]!.metadata).toEqual({ key: "val" });
  });

  it("validates missing = E006 and empty value E013", () => {
    expect(parseFloe('meta author "Alice"').diagnostics.some(d=>d.code==="E006")).toBe(true);
    expect(parseFloe('meta k = ""').diagnostics.some(d=>d.code==="E013")).toBe(true);
  });
});

describe("Floe v0.3 — Annotations & Links", () => {
  it("parses global and targeted annotations", () => {
    const { diagram } = parseFloe('note "global"\nA\nnote A "needs auth"');
    expect(diagram.annotations).toHaveLength(2);
    expect(diagram.annotations[0]!.target).toBeUndefined();
    expect(diagram.annotations[1]!.target).toBe("A");
  });

  it("validates unknown annotation target E014", () => {
    expect(parseFloe('note Unknown "text"').diagnostics.some(d=>d.code==="E014")).toBe(true);
  });

  it("parses link", () => {
    const { diagram } = parseFloe('API\nlink API "https://example.com"');
    expect(diagram.links).toHaveLength(1);
    expect(diagram.links[0]!.url).toBe("https://example.com");
  });

  it("validates unsafe link scheme E014", () => {
    expect(parseFloe('A\nlink A "javascript:alert(1)"').diagnostics.some(d=>d.code==="E014")).toBe(true);
    expect(parseFloe('A\nlink A "data:text/html,hi"').diagnostics.some(d=>d.code==="E014")).toBe(true);
  });

  it("validates duplicate link E014", () => {
    const { diagnostics } = parseFloe('A\nlink A "http://a.com"\nlink A "http://b.com"');
    expect(diagnostics.some(d=>d.code==="E014" && d.message.includes("Duplicate"))).toBe(true);
  });
});

describe("Floe v0.3 — IR & Compatibility", () => {
  it("IR is renderer-independent (no x/y)", () => {
    const { diagram } = parseFloe("A -> B");
    expect((diagram as any).x).toBeUndefined();
    expect((diagram as any).svg).toBeUndefined();
  });

  it("preserves v0.1 compatibility: direction, node types, edge labels", () => {
    const { diagram, diagnostics } = parseFloe("direction LR\nUser [person]\nUser -> Login : ok");
    expect(diagnostics.filter(d=>d.severity==="error")).toHaveLength(0);
    expect(diagram.direction).toBe("LR");
    expect(diagram.nodes.find(n=>n.id==="User")!.type).toBe("person");
    expect(diagram.edges[0]!.label).toBe("ok");
  });

  it("handles empty file", () => {
    const { diagram } = parseFloe("");
    expect(diagram.groups).toEqual([]);
    expect(diagram.metadata).toEqual({});
    expect(diagram.nodes).toHaveLength(0);
  });
});

describe("Floe v0.3 — Formatter & Renderer Integration", () => {
  it("formatter canonicalizes group header", async () => {
    const { format } = await import("../src/language/formatting.js");
    expect(format('group Backend{\nAPI\n}')).toBe('group Backend {\n  API\n}\n');
    expect(format('meta author="Alice"')).toBe('meta author = "Alice"\n');
    expect(format('A->B')).toBe('A -> B\n');
    expect(format('A--B')).toBe('A -- B\n');
  });

  it("formatter idempotent", async () => {
    const { format, isFormatted } = await import("../src/language/formatting.js");
    const src = 'group Backend {\n  API [service] "Gateway"\n}\n';
    expect(isFormatted(format(src))).toBe(true);
  });

  it("renderer distinguishes directed vs undirected", async () => {
    const { SimpleLayoutEngine } = await import("../src/layout/simple.js");
    const { renderSvg } = await import("../src/render/svg.js");
    const { parseFloe } = await import("../src/index.js");
    const diag = parseFloe("A -> B\nA -- B");
    const eng = new SimpleLayoutEngine();
    const layout = eng.layout(diag.diagram);
    const svg = renderSvg(layout);
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(svg).toContain('stroke-dasharray="6 3"');
  });

  it("renderer draws groups", async () => {
    const { parseFloe } = await import("../src/index.js");
    const { SimpleLayoutEngine } = await import("../src/layout/simple.js");
    const { renderSvg } = await import("../src/render/svg.js");
    const d = parseFloe("group Backend { A\n B }\nA -> B");
    const svg = renderSvg(new SimpleLayoutEngine().layout(d.diagram));
    expect(svg).toContain('group-Backend');
    expect(svg).toContain('class="groups"');
  });
});
