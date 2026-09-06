# Floe — Package Strategy (v1.0)

## Principle
Only publish packages that have a clear purpose. Do not split for appearance.

## Ecosystem (possible)
```text
@fazelstudio/floe                     # core: parser, IR, language services, SimpleLayoutEngine, renderer, pipeline (v1.0 ships this)
@fazelstudio/floe-renderer-svg       # SVG renderer split (future, currently built-in)
@fazelstudio/floe-layout             # layout engines (currently built-in; Simple + Dagre)
@fazelstudio/codemirror-lang-floe    # CodeMirror 6 integration (external sibling, already separate, Lezer grammar)
@fazelstudio/floe-lsp                # LSP server (currently via cli entry, future split)
@fazelstudio/floe-cli                # CLI (currently via bin floe in core)
```

## Decision for v1.0
**Publish only `@fazelstudio/floe` (core monolith) + already separate `@fazelstudio/codemirror-lang-floe`.**

Rationale:
- Core is zero-dep, small (<50kB dist), pure TS — no need to split for bundle size yet.
- Layout and renderer are tightly coupled to IR; splitting now adds complexity without user demand.
- CLI and LSP are Node entries within core (`./cli`, `./lsp` exports) — they reuse core without extra package.
- CodeMirror is already separate due to Lezer/Codemirror deps — that separation is justified (browser vs Node, heavy deps).

Future splits (if needed):
- If SVG renderer grows or needs separate versioning, extract `floe-renderer-svg`.
- If layout needs Dagre/ELK heavy deps, keep Simple in core and move Dagre to `floe-layout-dagre`.
- If CLI needs separate release cadence, extract `floe-cli`.

## Exports (v1.0)
`package.json`:
```json
{
  "name": "@fazelstudio/floe",
  "exports": {
    ".": { "import": "./dist/src/index.js", "types": "./dist/src/index.d.ts" },
    "./cli": { "import": "./dist/src/cli/main.js" },
    "./lsp": { "import": "./dist/src/lsp/server.js" },
    "./layout": { "import": "./dist/src/layout/index.js" },
    "./render": { "import": "./dist/src/render/index.js" },
    "./pipeline": { "import": "./dist/src/pipeline.js" }
  },
  "bin": { "floe": "./dist/src/cli/main.js" }
}
```
Core re-exports layout/render/pipeline for convenience, but direct imports via subpath are stable.

## Publishing Checks
- `bun run build` → `dist/` only (`npm run build` also works)
- `files: ["dist","README.md","LICENSE","CHANGELOG.md"]` — no `src/` in package
- `bundle-size` measured via `bun run bundle:measure` (`bun scripts/measure-bundle.ts`) — no claim "10x smaller than Mermaid", only actual numbers in `benchmarks/bundle-size.json`

## Versioning
See `docs/versioning.md` — SemVer after 1.0, separate package versions may diverge (core 1.0.0, codemirror-lang-floe 1.0.0 independently).
