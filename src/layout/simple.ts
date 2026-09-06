import type { FloeDiagram, Direction } from "../types.js";
import type { LayoutEngine, LayoutResult, LayoutNode, LayoutEdge, LayoutOptions, LayoutGroup } from "./types.js";

const DEFAULT_OPTS: Required<LayoutOptions> = {
  nodeWidth: 120,
  nodeHeight: 48,
  rankSep: 80,
  nodeSep: 32,
  margin: 32,
  minNodeWidth: 80,
  maxNodeWidth: 200,
};

/**
 * Deterministic, zero-dependency layered layout.
 * - No random, no timestamps, no nondeterministic ordering
 * - Supports TB, BT, LR, RL via coordinate transform
 * - Handles cycles via Kahn's topological longest-path (deterministic)
 */
export class SimpleLayoutEngine implements LayoutEngine {
  private opts: Required<LayoutOptions>;

  constructor(opts?: LayoutOptions) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  layout(diagram: FloeDiagram): LayoutResult {
    // Empty diagram: minimal SVG size, deterministic (include groups empty)
    if (diagram.nodes.length === 0 && (diagram.groups?.length ?? 0) === 0) {
      return {
        diagram,
        direction: diagram.direction,
        nodes: [],
        edges: [],
        groups: [],
        width: this.opts.margin * 2 + 100,
        height: this.opts.margin * 2 + 60,
      };
    }

    const edgesSorted = [...diagram.edges].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      if (a.target !== b.target) return a.target.localeCompare(b.target);
      return (a.label ?? "").localeCompare(b.label ?? "");
    });

    const nodeSizes = new Map<string, { w: number; h: number }>();
    for (const n of diagram.nodes) {
      const label = n.label ?? n.id;
      const size = estimateNodeSize(label, n.type, this.opts);
      nodeSizes.set(n.id, size);
    }

    const ranks = this.computeRanks(diagram.nodes, edgesSorted);

    const rankGroups = new Map<number, string[]>();
    for (const [id, rank] of ranks.entries()) {
      const arr = rankGroups.get(rank) ?? [];
      arr.push(id);
      rankGroups.set(rank, arr);
    }
    const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
    for (const r of sortedRanks) {
      rankGroups.get(r)!.sort((a, b) => a.localeCompare(b));
    }

    const tbPositions = this.assignTbPositions(rankGroups, sortedRanks, nodeSizes);
    const positioned = this.applyDirection(tbPositions, diagram.direction, nodeSizes);

    const layoutNodes: LayoutNode[] = diagram.nodes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => {
        const p = positioned.get(n.id)!;
        const sz = nodeSizes.get(n.id)!;
        return {
          id: n.id,
          label: n.label ?? n.id,
          type: n.type,
          x: p.x,
          y: p.y,
          width: sz.w,
          height: sz.h,
          data: n,
        };
      });

    let width: number;
    let height: number;
    if (positioned.size === 0) {
      width = this.opts.margin * 2 + 100;
      height = this.opts.margin * 2 + 60;
    } else {
      let maxX = -Infinity, maxY = -Infinity;
      for (const [id, pos] of positioned.entries()) {
        const sz = nodeSizes.get(id)!;
        const right = pos.x + sz.w / 2;
        const bottom = pos.y + sz.h / 2;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
      width = Math.ceil(maxX + this.opts.margin);
      height = Math.ceil(maxY + this.opts.margin);
      if (width < this.opts.margin * 2 + 100) width = this.opts.margin * 2 + 100;
      if (height < this.opts.margin * 2 + 60) height = this.opts.margin * 2 + 60;
    }

    const nodePosMap = positioned;
    const layoutEdges: LayoutEdge[] = edgesSorted.map((e) => {
      const srcPos = nodePosMap.get(e.source);
      const tgtPos = nodePosMap.get(e.target);
      if (!srcPos || !tgtPos) {
        return {
          source: e.source,
          target: e.target,
          label: e.label,
          points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          data: e,
        };
      }
      const srcSize = nodeSizes.get(e.source)!;
      const tgtSize = nodeSizes.get(e.target)!;
      const points = this.computeEdgePoints(
        { x: srcPos.x, y: srcPos.y, w: srcSize.w, h: srcSize.h },
        { x: tgtPos.x, y: tgtPos.y, w: tgtSize.w, h: tgtSize.h },
        diagram.direction,
        srcPos,
        tgtPos,
      );
      let labelPos: { x: number; y: number } | undefined;
      if (e.label) labelPos = this.computeLabelPos(points);
      return { source: e.source, target: e.target, label: e.label, points, labelPos, data: e };
    });

    const layoutGroups = this.computeGroups(diagram.groups ?? [], positioned, nodeSizes);

    let finalWidth = width;
    let finalHeight = height;
    for (const lg of layoutGroups) {
      const all = flattenGroups([lg]);
      for (const g of all) {
        const right = g.x + g.width / 2;
        const bottom = g.y + g.height / 2;
        if (right + this.opts.margin > finalWidth) finalWidth = Math.ceil(right + this.opts.margin);
        if (bottom + this.opts.margin > finalHeight) finalHeight = Math.ceil(bottom + this.opts.margin);
      }
    }

    return {
      diagram,
      direction: diagram.direction,
      nodes: layoutNodes,
      edges: layoutEdges,
      groups: layoutGroups,
      width: finalWidth,
      height: finalHeight,
    };
  }

  private computeRanks(
    nodes: FloeDiagram["nodes"],
    edges: FloeDiagram["edges"],
  ): Map<string, number> {
    const ranks = new Map<string, number>();
    for (const n of nodes) ranks.set(n.id, 0);

    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) {
      indeg.set(n.id, 0);
      adj.set(n.id, []);
    }
    const sortedEdges = [...edges].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      if (a.target !== b.target) return a.target.localeCompare(b.target);
      return (a.label ?? "").localeCompare(b.label ?? "");
    });
    for (const e of sortedEdges) {
      if (!indeg.has(e.target) || !adj.has(e.source)) continue;
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
      adj.get(e.source)!.push(e.target);
    }
    for (const list of adj.values()) list.sort((a, b) => a.localeCompare(b));

    const queue: string[] = [];
    for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
    queue.sort((a, b) => a.localeCompare(b));

    const processed = new Set<string>();
    while (queue.length > 0) {
      const u = queue.shift()!;
      processed.add(u);
      const uRank = ranks.get(u) ?? 0;
      const neighbors = adj.get(u) ?? [];
      for (const v of neighbors) {
        const cur = ranks.get(v) ?? 0;
        const proposed = uRank + 1;
        if (proposed > cur) ranks.set(v, proposed);
        const newDeg = (indeg.get(v) ?? 1) - 1;
        indeg.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
          queue.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    if (processed.size < nodes.length) {
      const remaining = nodes
        .map((n) => n.id)
        .filter((id) => !processed.has(id))
        .sort((a, b) => a.localeCompare(b));
      let maxRank = 0;
      for (const v of ranks.values()) if (v > maxRank) maxRank = v;
      for (const id of remaining) {
        let maxPred = -1;
        for (const e of sortedEdges) {
          if (e.target === id) {
            const predRank = ranks.get(e.source);
            if (predRank !== undefined && predRank > maxPred) maxPred = predRank;
          }
        }
        if (maxPred >= 0) {
          const proposed = maxPred + 1;
          ranks.set(id, proposed);
          if (proposed > maxRank) maxRank = proposed;
        } else {
          const proposed = maxRank + 1;
          ranks.set(id, proposed);
          maxRank = proposed;
        }
      }
    }

    const minRank = Math.min(...Array.from(ranks.values()));
    if (minRank !== 0) {
      for (const [k, v] of ranks.entries()) ranks.set(k, v - minRank);
    }

    return ranks;
  }

  private assignTbPositions(
    rankGroups: Map<number, string[]>,
    sortedRanks: number[],
    nodeSizes: Map<string, { w: number; h: number }>,
  ): Map<string, { x: number; y: number }> {
    const pos = new Map<string, { x: number; y: number }>();
    const { nodeHeight, rankSep, nodeSep, margin } = this.opts;

    let maxGroupWidth = 0;
    for (const r of sortedRanks) {
      const ids = rankGroups.get(r)!;
      let w = 0;
      for (const id of ids) w += nodeSizes.get(id)!.w;
      w += Math.max(0, ids.length - 1) * nodeSep;
      if (w > maxGroupWidth) maxGroupWidth = w;
    }

    for (const rank of sortedRanks) {
      const ids = rankGroups.get(rank)!;
      let groupWidth = 0;
      for (const id of ids) groupWidth += nodeSizes.get(id)!.w;
      groupWidth += Math.max(0, ids.length - 1) * nodeSep;

      const y = margin + rank * (nodeHeight + rankSep) + nodeHeight / 2;
      const startX = margin + (maxGroupWidth - groupWidth) / 2;

      let cursor = startX;
      for (const id of ids) {
        const sz = nodeSizes.get(id)!;
        const x = cursor + sz.w / 2;
        pos.set(id, { x: round2(x), y: round2(y) });
        cursor += sz.w + nodeSep;
      }
    }

    return pos;
  }

  private applyDirection(
    tbPos: Map<string, { x: number; y: number }>,
    direction: Direction,
    nodeSizes: Map<string, { w: number; h: number }>,
  ): Map<string, { x: number; y: number }> {
    if (direction === "TB") return tbPos;

    let maxX = -Infinity, maxY = -Infinity;
    for (const [id, p] of tbPos.entries()) {
      const sz = nodeSizes.get(id)!;
      const right = p.x + sz.w / 2;
      const bottom = p.y + sz.h / 2;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    const tbHeight = maxY + this.opts.margin;

    const result = new Map<string, { x: number; y: number }>();
    for (const [id, p] of tbPos.entries()) {
      let x = p.x;
      let y = p.y;
      if (direction === "BT") y = tbHeight - y;
      else if (direction === "LR") { const tmp = x; x = y; y = tmp; }
      else if (direction === "RL") { const tmp = x; x = tbHeight - y; y = tmp; }
      result.set(id, { x: round2(x), y: round2(y) });
    }

    return result;
  }

  private computeEdgePoints(
    src: { x: number; y: number; w: number; h: number },
    tgt: { x: number; y: number; w: number; h: number },
    direction: Direction,
    srcPos: { x: number; y: number },
    tgtPos: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    let isBackward = false;
    if (direction === "TB") isBackward = srcPos.y > tgtPos.y;
    else if (direction === "BT") isBackward = srcPos.y < tgtPos.y;
    else if (direction === "LR") isBackward = srcPos.x > tgtPos.x;
    else if (direction === "RL") isBackward = srcPos.x < tgtPos.x;

    const sameRank =
      (direction === "TB" || direction === "BT") ? Math.abs(srcPos.y - tgtPos.y) < 1 : Math.abs(srcPos.x - tgtPos.x) < 1;

    let sx: number, sy: number, tx: number, ty: number;

    if (sameRank) {
      if (srcPos.x < tgtPos.x) { sx = src.x + src.w / 2; sy = src.y; tx = tgt.x - tgt.w / 2; ty = tgt.y; }
      else { sx = src.x - src.w / 2; sy = src.y; tx = tgt.x + tgt.w / 2; ty = tgt.y; }
      if (direction === "LR" || direction === "RL") {
        if (srcPos.y < tgtPos.y) { sx = src.x; sy = src.y + src.h / 2; tx = tgt.x; ty = tgt.y - tgt.h / 2; }
        else { sx = src.x; sy = src.y - src.h / 2; tx = tgt.x; ty = tgt.y + tgt.h / 2; }
      }
    } else if (direction === "TB") {
      if (!isBackward) { sx = src.x; sy = src.y + src.h / 2; tx = tgt.x; ty = tgt.y - tgt.h / 2; }
      else { sx = src.x; sy = src.y - src.h / 2; tx = tgt.x; ty = tgt.y + tgt.h / 2; }
    } else if (direction === "BT") {
      if (!isBackward) { sx = src.x; sy = src.y - src.h / 2; tx = tgt.x; ty = tgt.y + tgt.h / 2; }
      else { sx = src.x; sy = src.y + src.h / 2; tx = tgt.x; ty = tgt.y - tgt.h / 2; }
    } else if (direction === "LR") {
      if (!isBackward) { sx = src.x + src.w / 2; sy = src.y; tx = tgt.x - tgt.w / 2; ty = tgt.y; }
      else { sx = src.x - src.w / 2; sy = src.y; tx = tgt.x + tgt.w / 2; ty = tgt.y; }
    } else {
      if (!isBackward) { sx = src.x - src.w / 2; sy = src.y; tx = tgt.x + tgt.w / 2; ty = tgt.y; }
      else { sx = src.x + src.w / 2; sy = src.y; tx = tgt.x - tgt.w / 2; ty = tgt.y; }
    }

    sx = round2(sx); sy = round2(sy); tx = round2(tx); ty = round2(ty);

    if (src.x === tgt.x && src.y === tgt.y) {
      const loopSize = 24;
      return [
        { x: sx, y: sy },
        { x: sx + loopSize, y: sy },
        { x: sx + loopSize, y: sy + loopSize },
        { x: src.x, y: src.y + src.h / 2 },
      ];
    }

    return [{ x: sx, y: sy }, { x: tx, y: ty }];
  }

  private computeLabelPos(points: Array<{ x: number; y: number }>): { x: number; y: number } {
    if (points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0]!.x, y: points[0]!.y };
    if (points.length === 2) {
      const a = points[0]!, b = points[1]!;
      return { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2 - 8) };
    }
    const mid = Math.floor(points.length / 2);
    const a = points[mid - 1]!, b = points[mid]!;
    return { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2 - 8) };
  }

  private computeGroups(
    groups: import("../types.js").FloeGroup[],
    positioned: Map<string, { x: number; y: number }>,
    nodeSizes: Map<string, { w: number; h: number }>,
  ): LayoutGroup[] {
    const groupPadding = 20;
    const headerHeight = 24;
    const recurse = (grp: import("../types.js").FloeGroup): LayoutGroup => {
      const childLayouts = grp.groups.map(recurse);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasContent = false;
      for (const nid of grp.nodeIds) {
        const pos = positioned.get(nid);
        const sz = nodeSizes.get(nid);
        if (!pos || !sz) continue;
        hasContent = true;
        const l = pos.x - sz.w / 2, r = pos.x + sz.w / 2, t = pos.y - sz.h / 2, b = pos.y + sz.h / 2;
        if (l < minX) minX = l;
        if (r > maxX) maxX = r;
        if (t < minY) minY = t;
        if (b > maxY) maxY = b;
      }
      for (const cl of childLayouts) {
        hasContent = true;
        const l = cl.x - cl.width / 2, r = cl.x + cl.width / 2, t = cl.y - cl.height / 2, b = cl.y + cl.height / 2;
        if (l < minX) minX = l;
        if (r > maxX) maxX = r;
        if (t < minY) minY = t;
        if (b > maxY) maxY = b;
      }
      if (!hasContent) {
        const cx = this.opts.margin + 50;
        const cy = this.opts.margin + 30;
        return {
          id: grp.id,
          label: grp.label ?? grp.id,
          type: grp.type,
          x: round2(cx),
          y: round2(cy),
          width: 100,
          height: 60,
          data: grp,
          memberIds: [...grp.nodeIds],
          children: childLayouts,
        };
      }
      minX -= groupPadding;
      maxX += groupPadding;
      minY -= groupPadding + headerHeight;
      maxY += groupPadding;
      const w = maxX - minX;
      const h = maxY - minY;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return {
        id: grp.id,
        label: grp.label ?? grp.id,
        type: grp.type,
        x: round2(cx),
        y: round2(cy),
        width: round2(w),
        height: round2(h),
        data: grp,
        memberIds: [...grp.nodeIds],
        children: childLayouts,
      };
    };
    const sorted = [...groups].sort((a, b) => a.id.localeCompare(b.id));
    return sorted.map(recurse);
  }
}

function estimateNodeSize(label: string, type: string | undefined, opts: Required<LayoutOptions>): { w: number; h: number } {
  const charW = 7;
  const paddingX = 24;
  let minW = opts.minNodeWidth;
  let maxW = opts.maxNodeWidth;
  let h = opts.nodeHeight;
  if (type === "database") { minW = Math.max(minW, 90); h = 48; }
  else if (type === "person") { minW = Math.max(minW, 80); h = 48; }
  const textW = label.length * charW + paddingX;
  let w = Math.max(minW, Math.min(maxW, textW));
  return { w: Math.round(w), h: Math.round(h) };
}

function flattenGroups(groups: LayoutGroup[]): LayoutGroup[] {
  const out: LayoutGroup[] = [];
  for (const g of groups) {
    out.push(g);
    if (g.children.length > 0) out.push(...flattenGroups(g.children));
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
