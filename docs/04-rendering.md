# Floe — Rendering (v1.0)

## Pipeline
```
source `.floe` → parseFloe → FloeDiagram (IR)
                → layoutEngine.layout(diagram) → LayoutResult (x/y, width/height, points)
                → renderSvg(layout) → SVG string
```
Convenience: `renderFloe(source, { layoutEngine, svgOptions })` does all three and returns timings/sizes.

## SVG Renderer (`src/render/svg.ts`)
- Deterministic: sorts nodes/edges/groups by id, no `Math.random`, no timestamps, no `NaN` in output.
- Dimensions: `layout.width/height + padding*2`, `viewBox="0 0 W H"`, `xmlns="http://www.w3.org/2000/svg"`.
- Escaping: `escapeXml` for labels, `escapeAttr` for attrs, `escapeId` for ids — prevents XSS. No `<script>`, `<foreignObject>`, `javascript:`.
- Styles: default CSS `.node text` only; user `opts.css` is trusted caller side, not from `.floe`.
- Markers: single `<marker id="arrowhead">` for directed edges; undirected (`--`) uses `stroke-dasharray="6 3"` and no marker.
- Labels: edge labels centered at edge midpoint with white background rect for readability.
- Groups: dashed container `stroke-dasharray="8 4"`, header bar `22px`, label centered.

## Node Shapes (`src/render/shapes.ts`)
Semantic type → shape/color (renderer maps, not semantics):
- `person` → capsule `rx = h/2`, `#fef3c7`/`#d97706`
- `service` → rounded rect `6`, `#dbeafe`/`#2563eb`
- `database` → cylinder (path + 2 ellipses), `#dcfce7`/`#16a34a`
- `client` → rounded rect variant
- `default` → `#f1f5f9`/`#334155`
Unknown types fallback to `default` — predictable.

## Security
- Labels may contain `& < > " '`; they are escaped.
- Ids sanitized for `id="node-..."` attributes.
- Edge label background prevents text overlap.
- Links not rendered as `<a>` (stored only). Future href must use `sanitizeUrl`.

## Example
```ts
import { renderFloe } from "@fazelstudio/floe/pipeline";
const { svg, layoutResult, parseResult, timings } = renderFloe("A -> B\nB -> C");
console.log(svg); // deterministic
```

See `tests/render.test.ts:1` for invariants and `benchmarks/run.ts` for render timings.
