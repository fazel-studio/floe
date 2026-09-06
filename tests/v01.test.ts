import { describe, it, expect } from "vitest";
import { parseFloe, parseRaw } from "../src/index.js";
import { isValidIdentifier } from "../src/types.js";

describe("v0.1 — basic edge parsing", () => {
  it("parses User -> Login, Login -> Dashboard", () => {
    const { diagram, diagnostics } = parseFloe("User -> Login\nLogin -> Dashboard");
    expect(diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(diagram.edges).toHaveLength(2);
    expect(diagram.edges[0]).toMatchObject({ source: "User", target: "Login" });
    expect(diagram.edges[1]).toMatchObject({ source: "Login", target: "Dashboard" });
  });
  it("stable IR: repeated parse yields same diagram", () => {
    const src = "User -> Login\nLogin -> Dashboard : authenticate";
    const a = parseFloe(src);
    const b = parseFloe(src);
    expect(a.diagram).toEqual(b.diagram);
    expect(a.diagnostics).toEqual(b.diagnostics);
  });
});

describe("v0.1 — implicit nodes", () => {
  it("creates implicit nodes for edge endpoints", () => {
    const { diagram } = parseFloe("A -> B");
    const ids = diagram.nodes.map(n => n.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });
  it("implicit + explicit merge keeps explicit type", () => {
    const { diagram } = parseFloe("User [person]\nUser -> Login");
    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.nodes.find(n => n.id === "User")?.type).toBe("person");
  });
});

describe("v0.1 — explicit nodes & types", () => {
  it("parses API [service], Database [database]", () => {
    const { diagram } = parseFloe("API [service]\nDatabase [database]");
    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.nodes.find(n => n.id === "API")?.type).toBe("service");
    expect(diagram.nodes.find(n => n.id === "Database")?.type).toBe("database");
  });
  it("bare node id creates explicit node", () => {
    const { diagram } = parseFloe("Cache");
    expect(diagram.nodes).toHaveLength(1);
    expect(diagram.nodes[0]!.id).toBe("Cache");
  });
});

describe("v0.1 — edge labels", () => {
  it("parses label after colon", () => {
    const { diagram } = parseFloe("User -> Login : authenticate");
    expect(diagram.edges[0]!.label).toBe("authenticate");
    expect(diagram.edges[0]!.labelRange).toBeDefined();
  });
  it("trims label and allows spaces", () => {
    const { diagram } = parseFloe("A -> B :  hello world  ");
    expect(diagram.edges[0]!.label).toBe("hello world");
  });
  it("empty label is E010", () => {
    const { diagnostics } = parseFloe("A -> B :");
    expect(diagnostics.some(d => d.code === "E010")).toBe(true);
  });
});

describe("v0.1 — comments", () => {
  it("ignores // comments full line and trailing", () => {
    const { diagram, diagnostics } = parseFloe("// comment\nUser -> Login // trailing\nLogin -> Dashboard : x");
    expect(diagnostics).toHaveLength(0);
    expect(diagram.edges).toHaveLength(2);
  });
});

describe("v0.1 — directions", () => {
  it.each(["TB","BT","LR","RL"] as const)("accepts direction %s", dir => {
    const { diagram, diagnostics } = parseFloe(`direction ${dir}\nA -> B`);
    expect(diagnostics).toHaveLength(0);
    expect(diagram.direction).toBe(dir);
    expect(diagram.directionRange).toBeDefined();
  });
  it("defaults to TB", () => {
    expect(parseFloe("A -> B").diagram.direction).toBe("TB");
  });
  it("invalid direction E001", () => {
    const { diagnostics } = parseFloe("direction XX");
    expect(diagnostics.some(d => d.code === "E001")).toBe(true);
  });
  it("duplicate direction E004", () => {
    const { diagnostics } = parseFloe("direction LR\ndirection TB");
    expect(diagnostics.some(d => d.code === "E004")).toBe(true);
  });
});

describe("v0.1 — diagnostics & malformed", () => {
  it("invalid identifier E002 (digit-prefixed)", () => {
    const { diagnostics } = parseFloe("123User -> Login");
    expect(diagnostics.some(d => d.code === "E002")).toBe(true);
  });
  it("identifier rule helper", () => {
    expect(isValidIdentifier("my-node")).toBe(true);
    expect(isValidIdentifier("123bad")).toBe(false);
    expect(isValidIdentifier("My Node")).toBe(false);
  });
  it("duplicate node E003", () => {
    const { diagnostics } = parseFloe("User [person]\nUser [service]");
    expect(diagnostics.some(d => d.code === "E003")).toBe(true);
  });
  it("missing target E009", () => {
    const { diagnostics } = parseFloe("User ->");
    expect(diagnostics.some(d => d.code === "E009")).toBe(true);
  });
  it("invalid character E007", () => {
    const { diagnostics } = parseFloe("User$ -> Login");
    // $ is UNKNOWN non-digit → E007 via codeForUnexpected
    expect(diagnostics.some(d => d.code === "E007")).toBe(true);
  });
  it("never crashes on incomplete/malformed", () => {
    for (const src of ["", "A", "A ->", "direction", "User [", "->", "User : label", "[[[", "User -> Lögin"]) {
      expect(() => parseFloe(src)).not.toThrow();
      expect(() => parseRaw(src)).not.toThrow();
    }
  });
  it("diagnostics have severity, message, range, code", () => {
    const { diagnostics } = parseFloe("direction XX");
    const d = diagnostics[0]!;
    expect(d.severity).toBe("error");
    expect(d.code).toBe("E001");
    expect(d.message.length).toBeGreaterThan(0);
    expect(d.range.start.line).toBe(1);
  });
});

describe("v0.1 — source ranges", () => {
  it("edge and node ranges 1-indexed", () => {
    const { diagram } = parseFloe("User -> Login");
    const e = diagram.edges[0]!;
    expect(e.range.start.line).toBe(1);
    expect(e.range.start.column).toBe(1);
    expect(e.sourceRange.start.column).toBe(1);
    expect(e.targetRange.start.column).toBe(9);
  });
  it("direction range stored", () => {
    const { diagram } = parseFloe("direction LR");
    expect(diagram.directionRange!.start.column).toBe(1);
  });
});
