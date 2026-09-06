import { parseFloe } from "./index.js";
import type { ParseResult } from "./types.js";
import type { LayoutEngine, LayoutResult } from "./layout/types.js";
import { SimpleLayoutEngine } from "./layout/simple.js";
import { renderSvg, type SvgRenderOptions } from "./render/svg.js";

export interface RenderPipelineResult {
  parseResult: ParseResult;
  layoutResult: LayoutResult;
  svg: string;
  timings: { parseMs: number; layoutMs: number; renderMs: number; totalMs: number };
  sizes: { svgLength: number; nodeCount: number; edgeCount: number };
}

export interface PipelineOptions {
  layoutEngine?: LayoutEngine;
  svgOptions?: SvgRenderOptions;
}

export function renderFloe(source: string, opts?: PipelineOptions): RenderPipelineResult {
  const t0 = performance.now();
  const parseResult = parseFloe(source);
  const t1 = performance.now();
  const engine: LayoutEngine = opts?.layoutEngine ?? new SimpleLayoutEngine();
  const layoutResult = engine.layout(parseResult.diagram);
  const t2 = performance.now();
  const svg = renderSvg(layoutResult, opts?.svgOptions);
  const t3 = performance.now();
  return {
    parseResult,
    layoutResult,
    svg,
    timings: {
      parseMs: round2(t1 - t0),
      layoutMs: round2(t2 - t1),
      renderMs: round2(t3 - t2),
      totalMs: round2(t3 - t0),
    },
    sizes: { svgLength: svg.length, nodeCount: layoutResult.nodes.length, edgeCount: layoutResult.edges.length },
  };
}

export function layoutFloe(source: string, engine?: LayoutEngine): { parseResult: ParseResult; layoutResult: LayoutResult } {
  const parseResult = parseFloe(source);
  const eng: LayoutEngine = engine ?? new SimpleLayoutEngine();
  const layoutResult = eng.layout(parseResult.diagram);
  return { parseResult, layoutResult };
}

export function renderDiagramToSvg(layout: LayoutResult, svgOpts?: SvgRenderOptions): string {
  return renderSvg(layout, svgOpts);
}

export function measurePipeline(source: string): RenderPipelineResult {
  return renderFloe(source);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
