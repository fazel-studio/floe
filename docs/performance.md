# Floe — Performance (v1.0, actual measurements)

**Do not publish unsupported claims such as "10x smaller than Mermaid." Use actual numbers below.**

## How to Measure

```bash
bun run build            # or npm run build / tsc -p tsconfig.build.json
bun run benchmark        # → benchmarks/results.json (parsing, layout, render, editor ops, large)
bun run bundle:measure   # → benchmarks/bundle-size.json (per-package raw bytes)
# npm still works: npm run build / npm run benchmark / npm run bundle:measure
```

`benchmarks/run.ts` measures `performance.now()` over 200 iterations per sample (times are avg/min/max) and writes `benchmarks/results.json`.
`scripts/measure-bundle.ts` reports raw `dist/` bytes and writes `benchmarks/bundle-size.json`.

## Results (2026-09-05, Bun 1.3.11 — Node compat v24.3.0 — win32 x64, via `bun benchmarks/run.ts`)

### Parsing, Layout, Render (avg over 200 runs, `bun benchmarks/run.ts`)

| Sample | chars | edges | parseFloe (incl. validation) | SimpleLayout | renderSvg | full pipeline |
|--------|-------|-------|-------------------------------|--------------|-----------|---------------|
| tiny (1 edge) | 6 | 1 | 0.066 ms | 0.139 ms | 0.045 ms | 0.107 ms |
| small (10 edges) | 90 | 10 | 0.054 ms | 0.067 ms | 0.136 ms | 0.245 ms |
| medium (50 edges) | 530 | 50 | 0.137 ms | 0.161 ms | 0.289 ms | 0.464 ms |
| large (500 edges) | 6281 | 500 | 1.267 ms | 1.560 ms | 2.222 ms | 4.921 ms |
| xlarge (1000 edges) | 12782 | 1000 | 1.880 ms | 2.316 ms | 5.058 ms | 9.690 ms |

*Node v24.17.0 via `npx tsx` gives similar slightly higher: tiny 0.07, small 0.09, medium 0.20, large 1.45, xlarge 1.99 — see git history. Bun is primary per `packageManager`.*

### Editor Operations (50-node sample, 500 iterations, Bun)

- diagnostics: 0.086 ms avg
- completion: 0.060 ms
- hover: 0.136 ms
- formatting: 0.127 ms
- symbols: 0.117 ms

### Large Diagram Scaling (single run, Bun)

| n | edges | nodes | parse | layout | render | svg size | total |
|---|-------|-------|-------|--------|--------|----------|-------|
| 100 | 100 | 101 | 0.2 ms | 0.3 ms | 0.4 ms | 55 kB | 0.9 ms |
| 500 | 500 | 501 | 0.7 ms | 1.1 ms | 2.1 ms | 275 kB | 3.9 ms |
| 1000 | 1000 | 1001 | 1.3 ms | 1.9 ms | 7.5 ms | 550 kB | 10.7 ms |
| 2000 | 2000 | 2001 | 2.8 ms | 4.2 ms | 10.5 ms | 1108 kB | 17.5 ms |

All large tests pass the guard in `corpus-comprehensive.test.ts`: parse <100 ms for 500 nodes, layout <200 ms, render <100 ms.

### Bundle Sizes (raw bytes, 2026-09-05 — via `bun run bundle:measure`)

| Package | bytes | kB |
|---------|-------|----|
| core (dist/src/index.js) | 3355 | 3.3 |
| parser (dist/src/parser.js) | 48008 | 46.9 |
| lexer (dist/src/lexer.js) | 10991 | 10.7 |
| types | 601 | 0.6 |
| validator | 11425 | 11.2 |
| layout Simple | 27024 | 26.4 |
| layout Dagre | 9516 | 9.3 |
| renderer SVG | 10222 | 10.0 |
| renderer shapes | 4704 | 4.6 |
| pipeline | 2173 | 2.1 |
| language services (dist/src/language/) | 147020 | 143.6 |
| CLI main | 5972 | 5.8 |
| LSP server | 22034 | 21.5 |
| full dist/ | 531176 | 518.7 |

CodeMirror integration external (`../codemirror-lang-floe`) — not built in this repo; measure separately via `gzip -c dist/src/index.js | wc -c` for gz size if needed.

Raw sizes only — no comparative claims. See `benchmarks/bundle-size.json` and `benchmarks/results.json` for machine-readable data.

## Notes
- SimpleLayoutEngine is deterministic and zero-dep; Dagre is experimental.
- 2000-node diagram without crash validates `src/layout/simple.ts:1` scaling.
- Fuzz + large tests ensure no infinite loops or uncontrolled growth (see `tests/fuzz.test.ts`).
