import type { Range } from "./range.js";

export type Direction = "TB" | "BT" | "LR" | "RL";
export const DIRECTIONS: readonly Direction[] = ["TB", "BT", "LR", "RL"] as const;
export const DEFAULT_DIRECTION: Direction = "TB";

/**
 * Identifier rules:
 * - Must match: [A-Za-z_][A-Za-z0-9_-]*
 */
export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export function isValidIdentifier(id: string): boolean {
  return IDENTIFIER_RE.test(id);
}

/** Semantic edge kind — v0.3 adds undirected */
export type EdgeKind = "directed" | "undirected";

/** Renderer-independent semantic model — no visual coordinates */
export interface FloeNode {
  id: string;
  /** Display label — quoted string after id/type, defaults to id if not set */
  label?: string;
  /** Explicit node type, e.g. "person", "service", "database" — semantic style reference */
  type?: string;
  range: Range;
}

export interface FloeAnnotation {
  /** Target node or group id; undefined => diagram-level */
  target?: string;
  text: string;
  range: Range;
}

export interface FloeLink {
  target: string;
  url: string;
  range: Range;
}

export interface FloeEdge {
  source: string;
  target: string;
  label?: string;
  kind: EdgeKind;
  range: Range;
  sourceRange: Range;
  targetRange: Range;
  labelRange?: Range;
}

export interface FloeGroup {
  id: string;
  label?: string;
  type?: string;
  range: Range;
  nodeIds: string[];
  groups: FloeGroup[];
  metadata: Record<string, string>;
  annotations: FloeAnnotation[];
  link?: string;
  parentId?: string;
}

export interface FloeDiagram {
  direction: Direction;
  directionRange?: Range;
  nodes: FloeNode[];
  edges: FloeEdge[];
  groups: FloeGroup[];
  metadata: Record<string, string>;
  annotations: FloeAnnotation[];
  links: FloeLink[];
}

export interface ParseResult {
  diagram: FloeDiagram;
  diagnostics: import("./diagnostics.js").Diagnostic[];
}
