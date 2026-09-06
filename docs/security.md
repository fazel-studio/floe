# Floe v1.0 — Security Review

**Date:** 2026-09-05  
**Scope:** untrusted `.floe` source → parser, IR, layout, SVG, CLI, LSP

> Floe must never execute arbitrary source content.

## Threat Model
`.floe` files are treated as **untrusted**. They may come from user uploads, AI generation, or external repos. The parser, validator, formatter, layout, renderer, CLI, and LSP must handle them without:
- code execution (`eval`, `new Function`, `vm`, `child_process.exec` on content)
- XSS via SVG
- resource loading (images, scripts, network)
- path traversal beyond explicit file args
- ReDoS / infinite loop / memory exhaustion

## Findings & Mitigations

### 1. No Code Execution
- **Scan:** `grep -R "eval\|new Function\|require.*vm"` across `src/` + `dist/src` → **0 hits** (Session 05 `security.test.ts` also asserts).
- **Parser:** hand-written recursive descent over `Lexer` tokens; never interpolates source into JS code.
- **Formatter / Layout / Renderer:** pure string manipulation; no `Function` constructor.
- **CLI/LSP:** read file via `fs.readFileSync(path, "utf-8")` only; never `require` or `import` file content.
- **Verdict:** **No high/medium issues.** Low future risk (link href) mitigated.

### 2. SVG Output
- **Escaping:** `escapeXml` for `&<>\"'`, `escapeAttr`, `escapeId` (non-alnum → `_`), `hashLabel`. No `<script>`, `<foreignObject>`, `onload` etc in template. `tests/security.test.ts` verifies `"<script>"` → `&lt;script&gt;`.
- **Child process:** `src/cli/main.ts:185` dynamic `import("../lsp/server.js")` only for `floe lsp` (trusted path). No `child_process.exec` on `.floe` content.

### 3. URLs
- **Sanitization:** `security/url.ts: sanitizeUrl` allows only `http://`, `https://`, `mailto:`, `/path`, or scheme-less relative. `validator.js` flags `javascript:` as `E014`.

### 4. CLI File Handling
- **Reads:** `fs.readFileSync` only, never `require`.
- **Writes:** `fs.writeFileSync` only for explicit `format --write` / `render -o`.

## Verification
- `bun run test` 387 tests include `security.test.ts` + `fuzz.test.ts` (1000+ random) — no crash.

## Recommended Next Steps
- Add `SECURITY.md` root if needed for GitHub.
