# Floe v1.0 — Release Checklist

Before v1.0:

- [x] grammar reviewed — `docs/00-language-freeze.md` + `SPEC.md`
- [x] syntax frozen — frozen as of 2026-09-05, versioning in `docs/versioning.md`
- [x] IR reviewed — `docs/03-semantic-model.md` + `src/types.ts:1`
- [x] public APIs reviewed — `docs/api.md`, `src/index.ts:1` cleaned (no wildcard)
- [x] parser fuzz tested — `tests/fuzz.test.ts` (1000 charset + 500 token + 300 structure + pathological, no crash/hang, bounded memory)
- [x] large diagrams tested — `corpus/large/*` (50/500/1000/2000) + `tests/corpus-comprehensive.test.ts` large guard + `benchmarks/run.ts` scaling
- [x] SVG security reviewed — `docs/security.md`, `src/render/svg.ts:194` escaping, `src/security/url.ts`, `tests/security.test.ts`
- [x] bundle sizes measured — `scripts/measure-bundle.ts` → `benchmarks/bundle-size.json` (actual, not claimed)
- [x] performance measured — `benchmarks/run.ts` → `benchmarks/results.json` (parsing, validation, layout, SVG, large, editor ops)
- [x] CLI tested — `tests/cli.test.ts` (check/format/render, exit codes, json, lsp, never crash)
- [x] LSP tested — `tests/lsp.test.ts` (diagnostics, completion, hover, definition, references, rename, formatting, symbols, folding)
- [x] CodeMirror integration tested — `tests/codemirror.test.ts` (package exists, Lezer grammar, no core coupling)
- [x] documentation complete — `docs/01-introduction.md` through `docs/12-examples.md` + `security.md` + `versioning.md` + `package-strategy.md` + `ai-reference.md`
- [x] examples complete — `examples/` + `docs/12-examples.md` + `corpus/` comprehensive
- [x] versioning policy documented — `docs/versioning.md`

## Definition of Done
v1.0 is complete only when language is stable enough that users can safely create `.floe` files without expecting basic syntax or core semantic model to change unexpectedly.

→ **DONE:** Language frozen as of `00-language-freeze.md`, breaking changes after 1.0 require major bump and migration guide. Do not add major features during final stabilization unless required to correct fundamental design flaw (none found).

## Publishing
- Version bump to `1.0.0` in `package.json` (and `../codemirror-lang-floe/package.json` if needed)
- `bun run build` → `dist/` verified (`npm run build` also works)
- `bun run test` → 387 tests passing (195 legacy + 192 new corpus/fuzz) — verified via `bun run test` and `npm test`
- `bun run typecheck` → no errors
- Tag `v1.0.0`, `CHANGELOG.md` updated
