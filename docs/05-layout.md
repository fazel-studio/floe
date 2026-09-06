# Floe — Layout (v1.0)

## Abstraction
```ts
interface LayoutEngine { layout(diagram: FloeDiagram): LayoutResult }
interface LayoutResult { diagram, direction, nodes, edges, groups?, width, height }
interface LayoutNode { id, label, type?, x, y, width, height, data: FloeNode }
interface LayoutEdge { source, target, label?, points: {x,y}[], labelPos?, data: FloeEdge }
interface LayoutGroup { id, label, type?, x, y, width, height, data: FloeGroup, memberIds, children }
```
Core does not depend on any layout implementation.

## SimpleLayoutEngine (default, zero-dep, deterministic)
- Rank assignment: longest-path layering via Kahn's topological sort (deterministic: alphabetical queue), handles cycles via extra pass (remaining nodes get `maxRank+1`).
- Grouping: per rank, sorted alphabetically, `nodeSep=32`, `rankSep=80`, `margin=32`, `nodeWidth` dynamic via `estimateNodeSize(label)`.
- Node size: `7px` per char `+24` padding, clamped `80–200`, type-specific tweaks (database wider).
- Coordinate assignment: TB first, then transform for `BT` (flip Y), `LR`/`RL` (swap axes). All positions `round2`.
- Edges: straight line between node perimeters (side chosen by `direction` and backward detection). Self-loop creates 4-point loop.
- Groups: hull of members + children, `padding=20`, `headerHeight=24`, nested via DFS sorted by id.
- Determinism: all sorts by `localeCompare`, no random, no `Date.now()`.

## DagreLayoutEngine (experimental)
- Optional `dagre` dependency (not installed by default). If not present, `layout()` throws helpful `"dagre not installed"` error.
- Replaceable via `createLayoutEngine("dagre")`.

## Performance
- 500 nodes: parse ~10ms, layout ~15ms, render ~5ms on reference (see `benchmarks/run.ts`)
- 2000 nodes: parse ~35ms, layout ~80ms, render ~20ms
- See `benchmarks/results.json` for actual numbers.

## Usage
```ts
import { SimpleLayoutEngine } from "@fazelstudio/floe/layout";
import { parseFloe } from "@fazelstudio/floe";
import { renderSvg } from "@fazelstudio/floe/render";

const { diagram } = parseFloe("A -> B\nB -> C");
const layout = new SimpleLayoutEngine().layout(diagram);
const svg = renderSvg(layout);
```
