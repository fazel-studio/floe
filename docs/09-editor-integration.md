# Floe — Editor Integration (v1.0)

## Architecture
```
Editor (VS Code / Neovim / Zed / Helix)
  ↓ LSP (stdio JSON-RPC)
Floe Language Services (src/language/*)
  ↓
Parser / Semantic Model
```

Also: CodeMirror 6 via `@fazelstudio/codemirror-lang-floe` (external sibling, Lezer grammar).

## Language Services (editor-independent, `src/language/`)
- `getDiagnostics(source)` — recoverable, stable codes, ranges
- `getCompletions(source, offset)` — directions after `direction`, types inside `[...]`, node ids after `->`/`--`, keywords at line start; no completions inside strings/comments; no random
- `getHover(source, offset)` — node id, type, label, incoming/outgoing edges, metadata, group membership
- `getSymbols(source)` — hierarchical (groups contain children), kinds: node/group/edge/direction/meta/annotation/link
- `getDefinition` / `getReferences` — definitions at declaration, references sorted by offset
- `rename` / `renameWord` — updates all occurrences, rejects invalid new name (`E002`), deterministic edits sorted descending for apply
- `format` / `isFormatted` — canonical, idempotent
- `getHighlightTokens` — scopes: keyword, string, comment, operator, typeName, variableName
- `getIndentForLine` / `getIndentationInfo` — 2 spaces per group depth
- `getFoldingRanges` — one per `group`, nested

All are in `src/language/index.ts:1` via `FloeLanguageService` singleton `floeLanguageService`.

## CodeMirror Package
External at `../codemirror-lang-floe` (or `packages/codemirror-lang-floe` fallback):
- `package.json` name `@fazelstudio/codemirror-lang-floe`
- `src/index.ts` uses `LRParser`/`LRLanguage`, `styleTags`, `syntaxHighlighting`, `HighlightStyle`, `completeFromList`/`floeCompletion`, `linter`/`floeLint`, `indentService`/`foldService`, `closeBrackets`, `commentTokens`, exports `floe`, `floeLanguage`, `floeHighlightStyle`
- Grammar `src/floe.grammar` with `@top Program`

Core (`src/index.ts`, `parser.ts`, etc.) has no `from "@codemirror"` import — tested in `codemirror.test.ts`.

## Performance
Editor ops benchmarked in `benchmarks/run.ts`: diagnostics ~0.1ms, completion ~0.2ms, hover ~0.1ms, formatting ~0.2ms for 50-node sample.

See `docs/api.md` for stable API and `benchmarks/results.json` for measurements.
