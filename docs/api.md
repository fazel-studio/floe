# Floe v1.0 — Public API Reference

**Package:** `@fazelstudio/floe` (v1.0.0)  
**Entry:** `dist/src/index.js` (also `src/index.ts` for types)

## Stability Guarantees
- APIs listed below are **stable** — semver-major for breaking changes.
- Anything not listed is **internal** and may change in minor/patch without notice.

## Supported Public API

### Core Parsing
```ts
import { parseFloe, parse, parseRaw, isValid } from "@fazelstudio/floe";
import type { FloeDiagram } from "@fazelstudio/floe";
import { DEFAULT_DIRECTION, DIRECTIONS, isValidIdentifier } from "@fazelstudio/floe";
```
`parseFloe(source:string):ParseResult` — recommended, never throws. `parse` alias, `parseRaw` raw, `isValid`.

### Language Services
```ts
import { FloeLanguageService, floeLanguageService } from "@fazelstudio/floe";
import { getDiagnostics, getCompletions, getHover, getSymbols, getDefinition, getReferences, rename, format } from "@fazelstudio/floe";
```
All `src/language/*` — deterministic, no eval.

### Layout
```ts
import { SimpleLayoutEngine } from "@fazelstudio/floe/layout";
```

### Rendering
```ts
import { renderSvg } from "@fazelstudio/floe/render";
import { renderFloe } from "@fazelstudio/floe/pipeline";
```

### CLI & LSP
`bin:floe` → `dist/src/cli/main.js`, `dist/src/lsp/server.js`

## Removed / Internal
`Lexer`, `Parser`, `validate` — low-level, use wrappers.

See `src/index.ts:1` for implementation.
