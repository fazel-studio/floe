import type { LayoutNode } from "../layout/types.js";

export type NodeShapeKind = "default" | "person" | "service" | "database" | "client";

export function getShapeKind(type?: string): NodeShapeKind {
  if (!type) return "default";
  const t = type.toLowerCase();
  if (t === "person") return "person";
  if (t === "service") return "service";
  if (t === "database" || t === "db") return "database";
  if (t === "client") return "client";
  return "default";
}

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  rx?: number;
}

export function shapeStyle(kind: NodeShapeKind): ShapeStyle {
  switch (kind) {
    case "person": return { fill: "#fef3c7", stroke: "#d97706", strokeWidth: 1.5, rx: 24 };
    case "service": return { fill: "#dbeafe", stroke: "#2563eb", strokeWidth: 1.5, rx: 6 };
    case "database": return { fill: "#dcfce7", stroke: "#16a34a", strokeWidth: 1.5 };
    case "client": return { fill: "#f3e8ff", stroke: "#9333ea", strokeWidth: 1.5, rx: 6 };
    default: return { fill: "#f1f5f9", stroke: "#334155", strokeWidth: 1.5, rx: 6 };
  }
}

export function renderNodeShape(node: LayoutNode): string {
  const kind = getShapeKind(node.type);
  const style = shapeStyle(kind);
  const x = fmt(node.x - node.width / 2);
  const y = fmt(node.y - node.height / 2);
  const w = fmt(node.width);
  const h = fmt(node.height);
  const fill = style.fill, stroke = style.stroke, sw = style.strokeWidth;

  if (kind === "database") return renderDatabaseShape(node, fill, stroke, sw);
  if (kind === "person") {
    const rx = fmt(node.height / 2);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
  }
  const rx = fmt(style.rx ?? 6);
  const ry = rx;
  if (kind === "client") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
}

function renderDatabaseShape(node: LayoutNode, fill: string, stroke: string, sw: number): string {
  const cx = node.x, cy = node.y, w = node.width, h = node.height;
  const left = cx - w / 2, right = cx + w / 2, top = cy - h / 2, bottom = cy + h / 2;
  const ellipseH = Math.min(10, h * 0.22);
  const rx = w / 2, ry = ellipseH;
  const x1 = fmt(left), x2 = fmt(right), yTop = fmt(top + ry), yBottom = fmt(bottom - ry);
  const d = [`M ${x1} ${yTop}`, `L ${x1} ${yBottom}`, `A ${fmt(rx)} ${fmt(ry)} 0 0 0 ${x2} ${yBottom}`, `L ${x2} ${yTop}`, `A ${fmt(rx)} ${fmt(ry)} 0 0 0 ${x1} ${yTop}`].join(" ");
  const topEllipse = `<ellipse cx="${fmt(cx)}" cy="${fmt(top + ry)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
  const body = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
  const bottomEllipse = `<ellipse cx="${fmt(cx)}" cy="${fmt(bottom - ry)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
  return `${body}\n${topEllipse}\n${bottomEllipse}`;
}

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/\.?0+$/, "");
}
