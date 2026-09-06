import type { LayoutResult } from "../layout/types.js";
import { renderNodeShape } from "./shapes.js";

export interface SvgRenderOptions {
  padding?: number;
  background?: string;
  fontFamily?: string;
  debug?: boolean;
  css?: string;
}

const DEFAULT_FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

export function renderSvg(layout: LayoutResult, opts?: SvgRenderOptions): string {
  const padding = opts?.padding ?? 0;
  const background = opts?.background ?? "#ffffff";
  const fontFamily = opts?.fontFamily ?? DEFAULT_FONT;

  const width = Math.ceil(layout.width + padding * 2);
  const height = Math.ceil(layout.height + padding * 2);
  const viewBox = `0 0 ${width} ${height}`;

  const nodesSorted = [...layout.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edgesSorted = [...layout.edges].sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return (a.label ?? "").localeCompare(b.label ?? "");
  });

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" font-family="${escapeAttr(fontFamily)}">`);
  if (background && background !== "transparent") parts.push(`<rect width="${width}" height="${height}" fill="${escapeAttr(background)}" />`);
  const css = opts?.css ?? defaultCss();
  parts.push(`<style>${css}</style>`);
  parts.push(`<defs>`);
  parts.push(`<marker id="arrowhead" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="10" markerHeight="7" orient="auto" markerUnits="strokeWidth">`);
  parts.push(`<path d="M 0 0 L 10 3.5 L 0 7 z" fill="#334155" />`);
  parts.push(`</marker>`);
  parts.push(`</defs>`);

  const offset = padding;
  if (offset !== 0) parts.push(`<g transform="translate(${offset} ${offset})">`);

  const groups = layout.groups ?? [];
  if (groups.length > 0) {
    parts.push(`<g class="groups">`);
    const flatGroups = flattenGroups(groups);
    for (const g of flatGroups) parts.push(renderGroupSvg(g, fontFamily));
    parts.push(`</g>`);
  }

  parts.push(`<g class="edges" stroke-linecap="round" stroke-linejoin="round">`);
  for (const e of edgesSorted) {
    const d = pointsToPath(e.points);
    const edgeId = `edge-${escapeId(e.source)}-${escapeId(e.target)}${e.label ? "-" + hashLabel(e.label) : ""}`;
    const isUndirected = (e.data as any)?.kind === "undirected";
    const dash = isUndirected ? ` stroke-dasharray="6 3"` : "";
    const marker = isUndirected ? "" : ` marker-end="url(#arrowhead)"`;
    parts.push(`<path id="${edgeId}" d="${d}" fill="none" stroke="#334155" stroke-width="1.6"${dash}${marker} />`);
  }
  parts.push(`</g>`);

  if (edgesSorted.some((e) => e.label)) {
    parts.push(`<g class="edge-labels">`);
    for (const e of edgesSorted) {
      if (!e.label) continue;
      const pos = e.labelPos ?? midpoint(e.points);
      const x = fmt(pos.x), y = fmt(pos.y), label = escapeXml(e.label);
      const estW = estimateTextWidth(e.label) + 8, estH = 16, rx = 4;
      parts.push(`<g class="edge-label" transform="translate(${x} ${y})">`);
      parts.push(`<rect x="${fmt(-estW / 2)}" y="${fmt(-estH / 2 + 1)}" width="${fmt(estW)}" height="${fmt(estH)}" rx="${rx}" ry="${rx}" fill="white" stroke="#e2e8f0" stroke-width="0.8" />`);
      parts.push(`<text text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#334155" font-family="${escapeAttr(fontFamily)}">${label}</text>`);
      parts.push(`</g>`);
    }
    parts.push(`</g>`);
  }

  parts.push(`<g class="nodes">`);
  for (const n of nodesSorted) {
    const shapeSvg = renderNodeShape(n);
    const label = escapeXml(n.label);
    const tx = fmt(n.x), ty = fmt(n.y);
    const kindClass = n.type ? `node-${escapeId(n.type)}` : `node-default`;
    parts.push(`<g id="node-${escapeId(n.id)}" class="node ${kindClass}" data-node-id="${escapeAttr(n.id)}"${n.type ? ` data-node-type="${escapeAttr(n.type)}"` : ""}>`);
    parts.push(shapeSvg);
    parts.push(`<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="#0f172a" font-family="${escapeAttr(fontFamily)}">${label}</text>`);
    parts.push(`</g>`);
  }
  parts.push(`</g>`);

  if (offset !== 0) parts.push(`</g>`);

  if (opts?.debug) {
    parts.push(`<g class="debug">`);
    for (const n of nodesSorted) {
      const x = fmt(n.x - n.width / 2), y = fmt(n.y - n.height / 2);
      parts.push(`<rect x="${x}" y="${y}" width="${fmt(n.width)}" height="${fmt(n.height)}" fill="none" stroke="red" stroke-dasharray="3 3" stroke-width="0.5" />`);
    }
    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

function defaultCss(): string {
  return `
  .node text { pointer-events: none; user-select: none; }
  .edge-label text { pointer-events: none; user-select: none; }
  `;
}
function pointsToPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  const start = points[0]!;
  let d = `M ${fmt(start.x)} ${fmt(start.y)}`;
  for (let i = 1; i < points.length; i++) d += ` L ${fmt(points[i]!.x)} ${fmt(points[i]!.y)}`;
  return d;
}
function midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  if (points.length === 2) return { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
  const mid = Math.floor(points.length / 2);
  return { x: (points[mid - 1]!.x + points[mid]!.x) / 2, y: (points[mid]!.y + points[mid]!.y) / 2 };
}
function estimateTextWidth(text: string): number { return text.length * 6.5; }
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/\.?0+$/, "");
}
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function escapeAttr(s: string): string { return escapeXml(s); }
function escapeId(s: string): string { return s.replace(/[^A-Za-z0-9_-]/g, "_"); }
function hashLabel(s: string): string {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}
function renderGroupSvg(g: import("../layout/types.js").LayoutGroup, fontFamily: string): string {
  const x = fmt(g.x - g.width / 2), y = fmt(g.y - g.height / 2), w = fmt(g.width), h = fmt(g.height);
  const label = escapeXml(g.label), gid = escapeId(g.id);
  const typeAttr = g.type ? ` data-group-type="${escapeAttr(g.type)}"` : "";
  const headerH = 22;
  const parts: string[] = [];
  parts.push(`<g id="group-${gid}" class="group group-${gid}" data-group-id="${escapeAttr(g.id)}"${typeAttr}>`);
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="8 4" />`);
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${fmt(headerH)}" rx="8" ry="8" fill="#e2e8f0" stroke="none" />`);
  parts.push(`<rect x="${x}" y="${fmt(g.y - g.height / 2 + headerH / 2)}" width="${w}" height="${fmt(headerH / 2)}" fill="#e2e8f0" stroke="none" />`);
  parts.push(`<text x="${fmt(g.x)}" y="${fmt(g.y - g.height / 2 + headerH / 2 + 1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#334155" font-family="${escapeAttr(fontFamily)}">${label}</text>`);
  parts.push(`</g>`);
  return parts.join("\n");
}
function flattenGroups(groups: import("../layout/types.js").LayoutGroup[]): import("../layout/types.js").LayoutGroup[] {
  const out: import("../layout/types.js").LayoutGroup[] = [];
  function dfs(arr: typeof groups) {
    const sorted = [...arr].sort((a, b) => a.id.localeCompare(b.id));
    for (const g of sorted) {
      out.push(g);
      if (g.children && g.children.length > 0) dfs(g.children);
    }
  }
  dfs(groups);
  return out;
}
