// @ts-nocheck
/**
 * Floe v0.4 — Language Tooling Tests
 * Verifikasi rekonstruksi layanan editor-independen terhadap artefak bertahan dist/src/language/*.
 * Mencakup: completion, diagnostics, hover, definitions, references, rename, formatting, symbols, folding, highlighting.
 * Semua diuji tanpa browser/DOM, pada dokumen Floe realistis dan input malformed.
 */
import { describe, it, expect } from "vitest";
import {
  getCompletions,
  getDiagnostics,
  getHover,
  getSymbols,
  getFlatSymbols,
  getDefinition,
  getDefinitionForWord,
  getReferences,
  getReferencesForWord,
  rename,
  renameWord,
  applyEdits,
  format,
  isFormatted,
  getHighlightTokens,
  getHighlightingInfo,
  getFoldingRanges,
  getFoldingInfo,
  getIndentForLine,
  getIndentationInfo,
  getIndentationColumn,
  DEFAULT_INDENT,
  buildSemanticModel,
  getSemanticModel,
  FloeLanguageService,
  floeLanguageService,
} from "../src/language/index.js";
import { parseFloe } from "../src/index.js";
import { positionAt, getTokenAtOffset, getTokenBeforeOffset } from "../src/language/utils.js";
import { tokenize } from "../src/lexer.js";

describe("Floe v0.4 — Tooling Types & Core Independence", () => {
  it("public types sesuai surviving .d.ts (CompletionItem, HoverInfo, SymbolInformation, etc.)", async () => {
    // Verifikasi keberadaan export types via runtime existence of functions
    expect(typeof getCompletions).toBe("function");
    expect(typeof getDiagnostics).toBe("function");
    expect(typeof getHover).toBe("function");
    expect(typeof getDefinition).toBe("function");
    expect(typeof getReferences).toBe("function");
    expect(typeof rename).toBe("function");
    expect(typeof format).toBe("function");
    expect(typeof getSymbols).toBe("function");
    expect(typeof getFoldingRanges).toBe("function");
    expect(typeof getHighlightTokens).toBe("function");
    expect(typeof getIndentForLine).toBe("function");
    expect(typeof buildSemanticModel).toBe("function");
  });

  it("core independence: language services tidak import CodeMirror/VSCode/DOM", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const langFiles = fs.readdirSync(path.join(process.cwd(), "src", "language"));
    for (const file of langFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), "src", "language", file), "utf-8");
      expect(content).not.toMatch(/from\s+["']@codemirror/);
      expect(content).not.toMatch(/from\s+["']vscode/);
      expect(content).not.toMatch(/from\s+["']react["']/);
      // DOM check: ensure no direct window/document API usage (allow comments)
      const lines = content.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const codeOnly = lines.join("\n");
      expect(codeOnly).not.toMatch(/window\./);
      expect(codeOnly).not.toMatch(/\bdocument\./);
    }
  });

  it("FloeLanguageService mengekspos semua layanan", () => {
    const svc = new FloeLanguageService();
    expect(typeof svc.getSemanticModel).toBe("function");
    expect(typeof svc.getDiagnostics).toBe("function");
    expect(typeof svc.getCompletions).toBe("function");
    expect(typeof svc.getHover).toBe("function");
    expect(typeof svc.getSymbols).toBe("function");
    expect(typeof svc.getDefinition).toBe("function");
    expect(typeof svc.getReferences).toBe("function");
    expect(typeof svc.rename).toBe("function");
    expect(typeof svc.format).toBe("function");
    expect(typeof svc.getHighlightTokens).toBe("function");
    expect(typeof svc.getFoldingRanges).toBe("function");
    expect(typeof svc.getIndentForLine).toBe("function");
    expect(floeLanguageService).toBeInstanceOf(FloeLanguageService);
  });
});

describe("Floe v0.4 — Diagnostics Service", () => {
  it("produces recoverable diagnostic for incomplete edge 'User ->' tanpa crash", () => {
    expect(() => getDiagnostics("User ->")).not.toThrow();
    const diags = getDiagnostics("User ->");
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some(d => d.code === "E009" || d.code === "E006")).toBe(true);
    // Harus memiliki range 1-indexed line/col, 0-indexed offset
    for (const d of diags) {
      expect(d.range.start.line).toBeGreaterThanOrEqual(1);
      expect(d.range.start.column).toBeGreaterThanOrEqual(1);
      expect(d.range.start.offset).toBeGreaterThanOrEqual(0);
      expect(d.severity).toMatch(/error|warning|info/);
      expect(d.code).toMatch(/E00\d/);
    }
    // parseFloe juga tidak crash
    expect(() => parseFloe("User ->")).not.toThrow();
    expect(parseFloe("User ->").diagram).toBeDefined();
  });

  it("diagnostics useful while document incomplete (valid setelah diperbaiki)", async () => {
    expect(getDiagnostics("direction LR\nA -> B").filter(d=>d.severity==="error")).toHaveLength(0);
    expect(getDiagnostics("direction XX").some(d=>d.code==="E001")).toBe(true);
    expect(getDiagnostics("User [person]\nUser [service]").some(d=>d.code==="E003")).toBe(true);
    const hasErrors = getDiagnostics("User ->").some(d=>d.severity==="error");
    expect(hasErrors).toBe(true);
    // getDiagnosticsWithSource wrapper
    const mod = await import("../src/language/diagnosticsService.js");
    const { diagnostics, hasErrors: he } = mod.getDiagnosticsWithSource("User ->");
    expect(he).toBe(true);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it("lint alias sorted by offset", async () => {
    const mod = await import("../src/language/diagnosticsService.js");
    const lint = mod.lint;
    // Actually import via language/index lint
    const diags = lint("direction XX\nUser [");
    for (let i=1;i<diags.length;i++) expect(diags[i].range.start.offset).toBeGreaterThanOrEqual(diags[i-1].range.start.offset);
  });

  it("never crashes on random malformed input", () => {
    const fuzz = ["", "!!!", "-> -> ->", "[[[[", "User -> -> Login", "direction", "User [", "A -> B :", "//", "\0\0", "group {", "group A {", "meta author", "note", "link"];
    for (const src of fuzz) {
      expect(() => getDiagnostics(src)).not.toThrow();
      expect(() => parseFloe(src)).not.toThrow();
    }
  });
});

describe("Floe v0.4 — Completion", () => {
  it("suggests TB/BT/LR/RL after 'direction'", () => {
    const items = getCompletions("direction", 9);
    expect(items.map(i=>i.label).sort()).toEqual(["BT","LR","RL","TB"].sort());
    expect(items.every(i=>i.kind==="value")).toBe(true);
    expect(items.every(i=>["TB","BT","LR","RL"].includes(i.label))).toBe(true);
  });

  it("suggests directions after 'direction ' with space", () => {
    expect(getCompletions("direction ", 10).map(i=>i.label).sort()).toEqual(["BT","LR","RL","TB"].sort());
  });

  it("filters direction suggestions by prefix T -> TB only", () => {
    const items = getCompletions("direction T", 11);
    expect(items.map(i=>i.label)).toContain("TB");
    expect(items.map(i=>i.label)).not.toContain("LR");
    expect(items.map(i=>i.label)).not.toContain("BT");
  });

  it("suggests known semantic node types inside brackets", () => {
    const items = getCompletions("User [", 6);
    expect(items.map(i=>i.label)).toContain("person");
    expect(items.map(i=>i.label)).toContain("service");
    expect(items.map(i=>i.label)).toContain("database");
    expect(items.every(i=>i.kind==="type")).toBe(true);
    // prefix filtering
    expect(getCompletions("User [per", 9).map(i=>i.label)).toContain("person");
    expect(getCompletions("User [per", 9).map(i=>i.label)).not.toContain("service");
  });

  it("suggests types for group header as well", () => {
    const items = getCompletions("group Backend [", 16);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].kind).toBe("type");
  });

  it("suggests node ids after edge operator -> / --", () => {
    const src = "User [person]\nAPI [service]\nUser -> ";
    const items = getCompletions(src, src.length);
    expect(items.map(i=>i.label)).toContain("User");
    expect(items.map(i=>i.label)).toContain("API");
    // -- juga
    const src2 = "A\nB\nA -- ";
    const items2 = getCompletions(src2, src2.length);
    // bila diagram memiliki nodes, harus suggest
    expect(Array.isArray(items2)).toBe(true);
  });

  it("does not produce completions inside strings/comments (avoid invalid syntax)", () => {
    expect(getCompletions('note "hello', 7)).toEqual([]); // inside STRING
    expect(getCompletions("// comment", 5)).toEqual([]);
    const insideStringOffset = 'User [person] "hello'.indexOf("hello")+2;
    expect(getCompletions('User [person] "hello"', insideStringOffset)).toEqual([]);
  });

  it("top-level suggests only valid keywords, not random", () => {
    const items = getCompletions("", 0);
    const valid = ["direction","group","meta","note","link"];
    for (const it of items) expect(valid).toContain(it.label);
    // prefix filtering
    expect(getCompletions("dir", 3).map(i=>i.label)).toContain("direction");
    expect(getCompletions("grou", 4).map(i=>i.label)).toContain("group");
  });

  it("after NOTE/LINK suggests existing ids (via prefix fallback)", () => {
    // Surviving completion for note/link uses fallback via top-level when prefix filters keywords to zero.
    // e.g. "note U" -> keywords filtered to none -> fallback to node ids.
    const src = "User\nAPI\nnote U";
    const items = getCompletions(src, src.length);
    expect(items.map(i=>i.label)).toContain("User");
    const src2 = "User\nlink U";
    expect(getCompletions(src2, src2.length).map(i=>i.label)).toContain("User");
    // Empty prefix after note returns keywords (surviving behavior) – verify not crash
    expect(getCompletions("User\nAPI\nnote ", "User\nAPI\nnote ".length).length).toBeGreaterThan(0);
  });
});

describe("Floe v0.4 — Hover", () => {
  it("exposes node ID, type, label, incoming/outgoing, metadata", () => {
    const src = 'direction LR\nmeta author = "Alice"\nUser [person] "End User"\nAPI [service]\nUser -> API : request\nAPI -> DB';
    const offset = src.indexOf('User [person]')+1;
    const hover = getHover(src, offset);
    expect(hover).not.toBeNull();
    const txt = hover.contents.join("\n");
    expect(txt).toContain("User");
    expect(txt).toContain("person");
    expect(txt).toContain("End User");
    expect(txt).toContain("Outgoing");
    expect(txt).toContain("Incoming");
    expect(txt).toContain("author"); // diagram metadata
    expect(hover.range).toBeDefined();
    expect(hover.range.start.offset).toBeGreaterThanOrEqual(0);
  });

  it("hover on group shows members, nested, metadata", () => {
    const src = 'group Backend {\n  API\n  Database\n  API -> Database\n}\nUser -> API';
    const offset = src.indexOf("API")+1;
    const hover = getHover(src, offset);
    expect(hover).not.toBeNull();
    // hover on node inside group should mention Groups
    expect(hover.contents.join(" ")).toMatch(/API|Groups/);
    // hover on group id itself
    const grpOffset = src.indexOf("Backend")+2;
    const grpHover = getHover(src, grpOffset);
    expect(grpHover.contents.join("\n")).toContain("Backend");
    expect(grpHover.contents.join("\n")).toMatch(/Members|Group/);
  });

  it("hover on direction keyword", () => {
    const src = "direction LR";
    const hover = getHover(src, 1); // inside "direction"
    expect(hover.contents[0]).toContain("direction");
  });

  it("returns null for whitespace / invalid offset", () => {
    expect(getHover("A -> B", 3)).toBeNull(); // space
    expect(getHover("A -> B", 1000)).toBeNull();
  });

  it("hover position/range accurate (1-indexed line/col)", () => {
    const src = "User [person]\nUser -> Login";
    const hover = getHover(src, src.indexOf("User [person]")+1);
    expect(hover.range.start.line).toBe(1);
    expect(hover.range.start.column).toBe(1);
  });
});

describe("Floe v0.4 — Definitions & References", () => {
  it("node declaration identifiable as definition", () => {
    const src = "User [person]\nUser -> Login\nLogin -> Dashboard";
    const refOffset = src.indexOf("User ->");
    const def = getDefinition(src, refOffset);
    expect(def).not.toBeNull();
    expect(def.range.start.line).toBe(1);
    // getDefinitionForWord alias
    expect(getDefinitionForWord(src, "User").range.start.line).toBe(1);
  });

  it("group definition identifiable", () => {
    const src = 'group Backend {\n  API\n}\nnote Backend "x"';
    const off = src.indexOf('note Backend')+5;
    const def = getDefinition(src, off);
    expect(def.range.start.line).toBe(1);
  });

  it("references discoverable (all IDENT occurrences)", () => {
    const src = "User [person]\nUser -> Login\nLogin -> Dashboard\nUser -> Dashboard";
    const refs = getReferences(src, src.indexOf("User [person]"));
    expect(refs.length).toBeGreaterThanOrEqual(3);
    // sorted deterministically
    for(let i=1;i<refs.length;i++) expect(refs[i].range.start.offset).toBeGreaterThan(refs[i-1].range.start.offset);
    // getReferencesForWord direct
    expect(getReferencesForWord(src, "Login").length).toBeGreaterThanOrEqual(2);
  });

  it("references via token scanning, not string replace (avoid inside strings)", () => {
    const src = 'User -> Login\nnote User "User should not be counted inside string User"';
    const refs = getReferencesForWord(src, "User");
    // Should find 2: declaration? Actually User declaration implicit via edge + note target = 2, not inside string
    // Ensure not counting inside string lexeme
    expect(refs.length).toBe(2);
  });

  it("no definition for unknown / non-ident", () => {
    expect(getDefinition("A -> B", 2)).toBeNull(); // space
    expect(getDefinitionForWord("A -> B", "Unknown")).toBeNull();
  });
});

describe("Floe v0.4 — Rename", () => {
  it("updates references without changing unrelated text", () => {
    const src = "User [person]\nUser -> Login\nLogin -> Dashboard";
    const res = rename(src, src.indexOf("User [person]"), "Customer");
    expect(res.error).toBeUndefined();
    expect(res.edits.length).toBeGreaterThanOrEqual(2);
    expect(res.newSource).toContain("Customer [person]");
    expect(res.newSource).toContain("Customer -> Login");
    expect(res.newSource).not.toContain("User [person]");
    // unrelated not changed
    expect(res.newSource).toContain("Login -> Dashboard");
    // substring test
    const src2 = "User\nSuperUser\nUser -> SuperUser";
    const res2 = renameWord(src2, "User", "Client");
    expect(res2.newSource).toContain("SuperUser"); // tetap
    expect((res2.newSource.match(/Client/g)||[]).length).toBe(2);
  });

  it("rejects invalid new name E002", () => {
    const res = rename("User -> Login", 0, "123bad");
    expect(res.error).toBeDefined();
    expect(res.code).toBe("E002");
    expect(renameWord("A -> B", "A", "bad name").error).toBeDefined();
  });

  it("edits sorted descending for applyEdits correctness", () => {
    const src = "A -> B\nA -> C\nA -> D";
    const res = renameWord(src, "A", "X");
    for(let i=1;i<res.edits.length;i++) expect(res.edits[i-1].range.start.offset).toBeGreaterThan(res.edits[i].range.start.offset);
    expect(res.newSource).toBe("X -> B\nX -> C\nX -> D");
    expect(applyEdits(src, [{range:{start:{line:1,column:1,offset:0},end:{line:1,column:2,offset:1}},newText:"Z"}])).toBe("Z -> B\nA -> C\nA -> D");
  });

  it("handles no identifier at offset", () => {
    expect(rename("A -> B", 2, "X").error).toBeDefined(); // offset 2 is space
  });
});

describe("Floe v0.4 — Formatting", () => {
  it("canonical formatting spec example", () => {
    expect(format("A->B\nB -> C: hello")).toBe("A -> B\nB -> C : hello\n");
  });

  it("deterministic (format twice yields same, isFormatted)", () => {
    const src = "A->B\nB->C\n User [person]  \n group Backend{\nAPI\n}";
    const once = format(src);
    expect(format(once)).toBe(once);
    expect(isFormatted(once)).toBe(true);
    expect(isFormatted(src)).toBe(false);
    for(let i=0;i<5;i++) expect(format(src)).toBe(once);
  });

  it("normalizes direction, node, group, meta, note, link", () => {
    expect(format("direction    LR")).toBe("direction LR\n");
    expect(format('group Backend [subsystem]  "Backend Services"  {\n meta  author = "Alice"  \nAPI[service]  "api"\n }')).toContain('group Backend [subsystem] "Backend Services" {');
    expect(format('meta author="Alice"')).toBe('meta author = "Alice"\n');
    expect(format('note "hi"')).toBe('note "hi"\n');
    expect(format('link API "https://x.com"')).toBe('link API "https://x.com"\n');
    expect(format('API[service]  "api"')).toBe('API [service] "api"\n');
    expect(format("A--B")).toBe("A -- B\n");
    expect(format("A -> B :   hello world  ")).toBe("A -> B : hello world\n");
  });

  it("preserves semantic meaning IDs/labels, normalizes whitespace", () => {
    const src = '  User   [person]   "End User"   ';
    expect(format(src)).toBe('User [person] "End User"\n');
    expect(format('A -> B // hello')).toBe('A -> B // hello\n');
    expect(format('// comment\nB -> C')).toContain("// comment");
  });

  it("handles indentation groups deterministically", () => {
    const src = "group Backend {\nAPI\nDatabase\n}";
    expect(format(src)).toBe("group Backend {\n  API\n  Database\n}\n");
    const nested = "group A {\ngroup B {\nX\n}\nY\n}";
    expect(format(nested)).toBe("group A {\n  group B {\n    X\n  }\n  Y\n}\n");
  });

  it("handles empty, blank, and options", () => {
    expect(format("")).toBe("");
    expect(format("   \n \t \n")).toBe("");
    expect(format("A -> B", { insertFinalNewline: false })).toBe("A -> B");
    expect(format("group A {\nX\n}", { indentString: "    " })).toBe("group A {\n    X\n}\n");
    expect(format("A -> B", { indentString: "    " })).toBe("A -> B\n");
  });
});

describe("Floe v0.4 — Symbols", () => {
  it("lists nodes, groups, edges, direction, annotations, links", () => {
    const src = 'direction LR\nUser [person]\ngroup Backend {\n  API\n}\nUser -> API\nnote "global"\nlink User "https://x.com"';
    const symbols = getSymbols(src);
    expect(symbols.some(s=>s.kind==="direction")).toBe(true);
    expect(symbols.some(s=>s.kind==="group" && s.name==="Backend")).toBe(true);
    expect(symbols.some(s=>s.kind==="node" && s.name==="User")).toBe(true);
    expect(symbols.some(s=>s.kind==="edge")).toBe(true);
    expect(symbols.some(s=>s.kind==="annotation")).toBe(true);
    expect(symbols.some(s=>s.kind==="link")).toBe(true);
    for(const s of symbols) {
      expect(s.range).toBeDefined();
      expect(s.range.start.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("hierarchical group children", () => {
    const src = "group A {\n group B {\n X\n }\n Y\n}";
    const symbols = getSymbols(src);
    const a = symbols.find(s=>s.name==="A");
    expect(a.children).toBeDefined();
    expect(a.children.map(c=>c.name)).toContain("B");
    expect(a.children.find(c=>c.name==="B").children).toBeDefined();
    // nodes inside groups not duplicated top-level
    const flat = getFlatSymbols(src);
    expect(flat.filter(s=>s.name==="X").length).toBe(1);
  });

  it("flat symbols", () => {
    const src = "A -> B\nB -> C";
    const flat = getFlatSymbols(src);
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every(s=>s.range!==undefined)).toBe(true);
  });
});

describe("Floe v0.4 — Folding", () => {
  it("provides folding for groups (1-indexed lines)", () => {
    const src = "group Backend {\n  API\n  Database\n}\nA -> B";
    const ranges = getFoldingRanges(src);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].startLine).toBe(1);
    expect(ranges[0].endLine).toBe(4);
    expect(ranges[0].kind).toBe("group");
    expect(getFoldingInfo(src)).toEqual(ranges);
  });

  it("nested groups two ranges", () => {
    const src = "group A {\n  group B {\n    X\n  }\n  Y\n}";
    const ranges = getFoldingRanges(src).sort((a,b)=>a.startLine-b.startLine);
    expect(ranges).toHaveLength(2);
    expect(ranges.map(r=>r.startLine)).toEqual([1,2]);
  });

  it("empty file no folding, unclosed still provides", () => {
    expect(getFoldingRanges("A -> B")).toHaveLength(0);
    const unclosed = getFoldingRanges("group A {\n X");
    expect(unclosed.length).toBeGreaterThanOrEqual(1);
    expect(unclosed[0].endLine).toBeGreaterThan(unclosed[0].startLine);
  });
});

describe("Floe v0.4 — Highlighting", () => {
  it("provides highlighting independent of editor, maps token types to scopes", () => {
    const src = 'direction LR\nUser [person] "label" // comment\nUser -> Login : hello';
    const tokens = getHighlightTokens(src);
    expect(tokens.some(t=>t.scope==="keyword" && t.lexeme==="direction")).toBe(true);
    expect(tokens.some(t=>t.scope==="string")).toBe(true);
    expect(tokens.some(t=>t.scope==="comment")).toBe(true);
    expect(tokens.some(t=>t.scope==="operator" && t.lexeme==="->")).toBe(true);
    expect(tokens.some(t=>t.scope==="punctuation")).toBe(true);
    // typeName inside brackets
    const typeTok = tokens.find(t=>t.lexeme==="person");
    expect(typeTok.scope).toBe("typeName");
    expect(getHighlightingInfo(src)).toEqual(tokens);
    for(const t of tokens) {
      expect(t.range).toBeDefined();
      expect(t.type).toBeDefined();
      expect(t.lexeme).toBeDefined();
    }
  });

  it("UNKNOWN flagged as invalid", () => {
    const tokens = getHighlightTokens("A $ B");
    expect(tokens.find(t=>t.lexeme==="$").scope).toBe("invalid");
  });
});

describe("Floe v0.4 — Indentation & Semantic Model", () => {
  it("indentation brace-driven", () => {
    expect(getIndentForLine("group Backend {\nAPI\nDatabase\n}", 2)).toBe("  ");
    expect(getIndentForLine("group Backend {\nAPI\nDatabase\n}", 4)).toBe("");
    const nested = "group A {\n  group B {\n    X\n  }\n  Y\n}";
    const lines = nested.split("\n");
    expect(getIndentForLine(nested, lines.findIndex(l=>l.trim()==="X")+1)).toBe("    ");
    expect(getIndentForLine(nested, lines.findIndex(l=>l.trim()==="Y")+1)).toBe("  ");
    expect(getIndentationInfo(nested).length).toBe(lines.length);
    expect(getIndentationColumn(nested, 2)).toBe(2);
    expect(DEFAULT_INDENT).toBe("  ");
  });

  it("semantic model wraps parser+validator+lexer", () => {
    const model = buildSemanticModel("direction LR\nUser -> API");
    expect(model.source).toBe("direction LR\nUser -> API");
    expect(model.diagram.direction).toBe("LR");
    expect(model.diagnostics).toBeDefined();
    expect(model.tokens.length).toBeGreaterThan(0);
    expect(getSemanticModel("A -> B").diagram.nodes.length).toBe(2);
    // find helpers
    const m2 = buildSemanticModel("group G { API }");
    expect(m2.diagram.groups[0].id).toBe("G");
  });

  it("utils positionAt/offsetAt correct for \\r\\n", () => {
    const src = "a\r\nb\nc";
    expect(positionAt(src, 0).line).toBe(1);
    expect(positionAt(src, 3).line).toBe(2); // after \r\n
    expect(positionAt(src, src.indexOf("c")).line).toBe(3);
    const pos = { line: 2, column: 1, offset: 3 };
    expect(positionAt(src, 3).line).toBe(2);
  });

  it("integration via FloeLanguageService", () => {
    const svc = new FloeLanguageService();
    const src = "direction LR\nA -> B";
    expect(svc.getDiagnostics(src).length).toBe(0);
    expect(svc.getCompletions("direction",9).length).toBeGreaterThan(0);
    expect(svc.getHover("A [person]",0)).not.toBeNull();
    expect(svc.getSymbols(src).length).toBeGreaterThan(0);
    expect(svc.format("A->B")).toBe("A -> B\n");
    expect(svc.getHighlightTokens(src).length).toBeGreaterThan(0);
    expect(svc.getFoldingRanges("group X {\nA\n}").length).toBe(1);
    expect(svc.getIndentForLine("group X {\nA\n}",2)).toBe("  ");
  });

  it("malformed/incomplete input never crashes across all services", () => {
    const fuzz = ["", "User ->", "group {", "group A {", "meta author", "note", "link", "A $ B", "direction", "User [", "A -> B :", "//"];
    for(const src of fuzz) {
      expect(() => getCompletions(src, src.length)).not.toThrow();
      expect(() => getDiagnostics(src)).not.toThrow();
      expect(() => getHover(src, 0)).not.toThrow();
      expect(() => getDefinition(src, 0)).not.toThrow();
      expect(() => getReferences(src, 0)).not.toThrow();
      expect(() => rename(src, 0, "Valid")).not.toThrow();
      expect(() => format(src)).not.toThrow();
      expect(() => getSymbols(src)).not.toThrow();
      expect(() => getFoldingRanges(src)).not.toThrow();
      expect(() => getHighlightTokens(src)).not.toThrow();
      expect(() => getIndentForLine(src,1)).not.toThrow();
      expect(() => buildSemanticModel(src)).not.toThrow();
    }
  });
});
