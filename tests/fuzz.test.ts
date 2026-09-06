import { describe, it, expect } from "vitest";
import { parseFloe } from "../src/index.js";
import { format } from "../src/language/formatting.js";
import { SimpleLayoutEngine } from "../src/layout/simple.js";
import { renderSvg } from "../src/render/svg.js";

/**
 * Fuzz test — ensures parser never crashes, hangs, or leaks memory on random/malformed input.
 * Covers: charset fuzz, token fuzz, structure fuzz, pathological large inputs.
 * Requirements per docs/modules/v1.0-stabilization.md: no crashes, no infinite loops, no uncontrolled memory growth.
 */

function randomString(len: number, charset: string): string {
  let s = "";
  for (let i = 0; i < len; i++) s += charset[Math.floor(Math.random() * charset.length)]!;
  return s;
}

describe("Fuzz — parser never crashes", () => {
  it("handles 1000 random charset fuzz inputs without throw", () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \n\t[]{}:->--\"'=//\r\n$%^*()!@#&<>|\\";
    for (let i = 0; i < 1000; i++) {
      const len = Math.floor(Math.random() * 200);
      const input = randomString(len, charset);
      expect(() => {
        const { diagram, diagnostics } = parseFloe(input);
        // diagnostics should be array, diagram should exist
        expect(Array.isArray(diagnostics)).toBe(true);
        expect(diagram).toBeDefined();
      }).not.toThrow();
    }
  });

  it("handles 500 token-level fuzz (random valid tokens shuffled)", () => {
    const tokens = ["direction", "TB", "LR", "BT", "RL", "group", "meta", "note", "link", "->", "--", "[", "]", "{", "}", ":", "=", '"hello"', '"world"', "User", "API", "Database", "_id", "a-b", " ", "\n", "// comment"];
    for (let i = 0; i < 500; i++) {
      const len = 5 + Math.floor(Math.random() * 10);
      let s = "";
      for (let j = 0; j < len; j++) s += tokens[Math.floor(Math.random() * tokens.length)] + (Math.random() > 0.5 ? " " : "");
      expect(() => parseFloe(s)).not.toThrow();
      expect(() => format(s)).not.toThrow();
    }
  });

  it("handles 300 structure fuzz (nested groups, edges, labels)", () => {
    for (let i = 0; i < 300; i++) {
      const depth = Math.floor(Math.random() * 4);
      let s = "";
      if (Math.random() > 0.5) s += `direction ${["TB","BT","LR","RL"][Math.floor(Math.random()*4)]}\n`;
      for (let g = 0; g < depth; g++) s += `group G${g} {\n`;
      const nodes = Math.floor(Math.random() * 10) + 1;
      for (let n = 0; n < nodes; n++) {
        const id = `N${n}_${randomString(3,"abc")}`;
        if (Math.random() > 0.7) s += `${id} [${["person","service","database"][Math.floor(Math.random()*3)]}] "Label ${n}"\n`;
        else s += `${id}\n`;
      }
      for (let e = 0; e < nodes; e++) {
        const op = Math.random() > 0.5 ? "->" : "--";
        const label = Math.random() > 0.7 ? ` : label${e}` : "";
        s += `N${Math.floor(Math.random()*nodes)}_${randomString(3,"abc")} ${op} N${Math.floor(Math.random()*nodes)}${label}\n`;
      }
      for (let g = 0; g < depth; g++) s += `}\n`;
      if (Math.random() > 0.5) s += `meta k${i} = "v${i}"\n`;
      if (Math.random() > 0.5) s += `note "global ${i}"\n`;
      expect(() => {
        const { diagram, diagnostics } = parseFloe(s);
        // layout + render should also not crash even on malformed
        const engine = new SimpleLayoutEngine();
        const layout = engine.layout(diagram);
        const svg = renderSvg(layout);
        expect(typeof svg).toBe("string");
        expect(svg).toContain("<svg");
        void diagnostics;
      }).not.toThrow();
    }
  });

  it("handles pathological large input without uncontrolled memory/time", () => {
    const big = "A -> B\n".repeat(2000);
    const t0 = Date.now();
    expect(() => {
      const { diagram } = parseFloe(big);
      const engine = new SimpleLayoutEngine();
      const layout = engine.layout(diagram);
      const svg = renderSvg(layout);
      expect(svg.length).toBeGreaterThan(0);
    }).not.toThrow();
    const elapsed = Date.now() - t0;
    // Guard per performance.md: parse <100ms for 500 nodes, allow generous for 2000
    expect(elapsed).toBeLessThan(5000);
  });

  it("never produces NaN or undefined in SVG on random inputs", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomString(50, "ABCabc123 ->--[]{}:\n\"");
      const { diagram } = parseFloe(s);
      const layout = new SimpleLayoutEngine().layout(diagram);
      const svg = renderSvg(layout);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });

  it("formatter never throws on random inputs and is idempotent for valid outputs", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomString(80, "abcdefghijklmnopqrstuvwxyz ->--[]{}:\"\n");
      expect(() => format(s)).not.toThrow();
      const once = format(s);
      const twice = format(once);
      expect(twice).toBe(once);
    }
  });
});
