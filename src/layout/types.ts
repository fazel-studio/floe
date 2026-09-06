import type { FloeDiagram, FloeNode, FloeEdge, Direction } from "../types.js";

/**
 * Layout abstraction — renderer independent, replaceable.
 * Core must not depend on any particular layout engine.
 */
export interface LayoutEngine {
  layout(diagram: FloeDiagram): LayoutResult;
}

export interface LayoutNode {
  id: string;
  label: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** reference to original IR node if needed */
  data: FloeNode;
}

export interface LayoutEdge {
  source: string;
  target: string;
  label?: string;
  points: Array<{ x: number; y: number }>;
  labelPos?: { x: number; y: number };
  data: FloeEdge;
}

export interface LayoutGroup {
  id: string;
  label: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: import("../types.js").FloeGroup;
  memberIds: string[];
  children: LayoutGroup[];
}

export interface LayoutResult {
  diagram: FloeDiagram;
  direction: Direction;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups?: LayoutGroup[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
  margin?: number;
  minNodeWidth?: number;
  maxNodeWidth?: number;
}
