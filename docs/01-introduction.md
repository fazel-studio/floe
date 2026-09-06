# Floe — Introduction (v1.0)

Floe is a lightweight, human-readable, AI-friendly diagram DSL for directed graphs. Files are `.floe`, UTF-8, line-oriented.

**Design goals:**
- Renderer-independent semantic model (no coordinates in IR)
- Human-readable: `User -> Login : success`
- AI-friendly: predictable grammar, deterministic formatting, stable diagnostics
- Never crash on malformed input — diagnostics instead
- Deterministic layout & SVG rendering
- Editor-agnostic language services (reuse via LSP & CodeMirror)

**Status:** v1.0 stable — language frozen, see `00-language-freeze.md`.

**Hello world:**
```floe
direction LR
User [person] "End User"
API [service] "API Gateway"
User -> API : request
API -> Database : query
```

**Tooling:**
- `floe check` — validate
- `floe format` — canonical format (idempotent)
- `floe render` — SVG
- `floe lsp --stdio` — editor integration

**Packages:** `@fazelstudio/floe` (core), `@fazelstudio/codemirror-lang-floe`, `@fazelstudio/floe-renderer-svg` (svg is built-in for now, separate package is future), `@fazelstudio/floe-layout` (layout engines), `@fazelstudio/floe-cli`, `@fazelstudio/floe-lsp`.

See `package-strategy.md` for why we keep core monolithic for v1.0.

**Stable vs Experimental:**
- Stable: syntax in `00-language-freeze.md`, IR, diagnostics `E001`–`E014`, CLI/LSP capabilities listed in `api.md`
- Experimental: `DagreLayoutEngine`, bundle size claims, Codemirror grammar versioning (separate).
