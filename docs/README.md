# Floe Documentation — v1.0

Stable release documentation.

- `01-introduction.md` — Introduction
- `02-syntax.md` — Syntax
- `language-specification.md` — Language Specification (frozen, summary of SPEC.md)
- `03-semantic-model.md` — Semantic Model
- `04-rendering.md` — Rendering
- `05-layout.md` — Layout
- `06-validation.md` — Validation
- `07-formatting.md` — Formatting
- `08-ai-generation.md` — AI Generation (also `ai-reference.md` concise)
- `09-editor-integration.md` — Editor Integration (LSP + CodeMirror)
- `10-cli.md` — CLI
- `11-lsp.md` — LSP
- `12-examples.md` — Examples
- `00-language-freeze.md` — Frozen grammar & stable vs experimental
- `api.md` — Public API Reference (API Stability)
- `performance.md` — Performance (actual parsing, layout, render, large diagrams, editor ops) + bundle sizes
- `security.md` — Security Review (untrusted input, SVG, metadata, URLs, deps, CLI)
- `versioning.md` — Versioning Policy (SemVer after 1.0)
- `package-strategy.md` — Package Strategy
- `ai-reference.md` — Concise AI Reference
- `release-checklist.md` — Release Checklist (Definition of Done)

Source of truth: `../SPEC.md`

Corpus: `../corpus/README.md` — comprehensive categories `basic/labels/nodes/groups/direction/metadata/invalid/edge-cases/large`

Benchmarks: `../benchmarks/run.ts` (performance) and `../scripts/measure-bundle.ts` (bundle sizes) → `../benchmarks/results.json`, `bundle-size.json`

Security: see `security.md` and `src/security/url.ts`

Release checklist: `release-checklist.md`
