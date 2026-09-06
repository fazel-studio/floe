export type { LayoutEngine, LayoutResult, LayoutNode, LayoutEdge, LayoutGroup, LayoutOptions } from "./types.js";
export { SimpleLayoutEngine } from "./simple.js";
export { DagreLayoutEngine } from "./dagre.js";

import { SimpleLayoutEngine } from "./simple.js";
import { DagreLayoutEngine } from "./dagre.js";
import type { LayoutEngine } from "./types.js";

export function createDefaultLayoutEngine(): LayoutEngine {
  return new SimpleLayoutEngine();
}

export function createLayoutEngine(kind: "simple" | "dagre" = "simple"): LayoutEngine {
  if (kind === "dagre") return new DagreLayoutEngine();
  return new SimpleLayoutEngine();
}
