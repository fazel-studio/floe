# Floe v1.0 — Language Specification

**File extension:** `.floe`  
**Status:** Stable (v1.0.0) — initial open source release. Frozen grammar, renderer-independent IR, full tooling.  
**Source of truth:** This file; for detailed freeze see `docs/00-language-freeze.md`.

## 1. File Model
- UTF-8, line-oriented, `\n` or `\r\n` or `\r` as NEWLINE, blank lines ignored, `//` comment to end-of-line, whitespace ` ` `\t` separators only.

## 2. Tokens
```
IDENT         ::= [A-Za-z_][A-Za-z0-9_-]*   // ^[A-Za-z_][A-Za-z0-9_-]*$
DIRECTION_KW  ::= "direction"
GROUP_KW      ::= "group"
META_KW       ::= "meta"
NOTE_KW       ::= "note"
LINK_KW       ::= "link"
ARROW         ::= "->"
DASHDASH      ::= "--"
LBRACKET      ::= "["
RBRACKET      ::= "]"
LBRACE        ::= "{"
RBRACE        ::= "}"
COLON         ::= ":"
EQUALS        ::= "="
STRING        ::= '"' ( [^"\n] | '\"' | '\\' | '\n' | '\t' )* '"'
COMMENT       ::= "//" ...
NEWLINE       ::= \n | \r\n | \r
```

## 3. Grammar (EBNF — Frozen)
```ebnf
Program        ::= (Statement | NEWLINE | COMMENT)* EOF
Statement      ::= DirectionStmt | NodeStmt | EdgeStmt | GroupStmt | MetadataStmt | AnnotationStmt | LinkStmt
DirectionStmt  ::= "direction" Direction
Direction      ::= "TB" | "BT" | "LR" | "RL"
NodeStmt       ::= IDENT ("[" IDENT "]")? (STRING)?
EdgeStmt       ::= IDENT EdgeOp IDENT (":" Label)?
EdgeOp         ::= "->" | "--"
GroupStmt      ::= "group" IDENT ("[" IDENT "]")? (STRING)? "{" GroupBody "}"
GroupBody      ::= (Statement | NEWLINE | COMMENT)*
MetadataStmt   ::= "meta" IDENT "=" STRING
AnnotationStmt ::= "note" (IDENT)? STRING
LinkStmt       ::= "link" IDENT STRING
IDENT          ::= [A-Za-z_][A-Za-z0-9_-]*
STRING         ::= '"' ( [^"\n] | '\"' | '\\' | '\n' | '\t' )* '"'
```

## 4. Identifier Rules
- Must match `^[A-Za-z_][A-Za-z0-9_-]*$`, start with letter or `_`, may contain hyphen/underscore, no spaces, no Unicode beyond ASCII (>127 → E007), case-sensitive.

## 5. Semantics (IR)
See `docs/03-semantic-model.md` and `src/types.ts:1`. Core types: `Direction`, `EdgeKind`, `FloeNode`, `FloeEdge`, `FloeGroup`, `FloeAnnotation`, `FloeLink`, `FloeDiagram`, `ParseResult`. Parsing (syntax + ranges + recovery) is separate from validation (E001–E014).

## 6. Validation Codes
`E001` invalid direction, `E002` invalid identifier, `E003` duplicate node, `E004` duplicate direction, `E005` malformed, `E006` incomplete, `E007` invalid character, `E008` invalid node type, `E009` missing edge target, `E010` empty label, `E011` duplicate group, `E012` unclosed group, `E013` invalid metadata, `E014` invalid annotation/link. See `docs/06-validation.md`.

## 7. Rendering & Layout
Pipeline `parseFloe → layoutEngine.layout → renderSvg → SVG`. `SimpleLayoutEngine` zero-dep deterministic (Kahn, alphabetical, TB then transform BT/LR/RL, 7px*len+24 clamp 80–200, margin 32, rankSep 80, nodeSep 32). SVG deterministic, escaped, `arrowhead` marker, `stroke-dasharray="6 3"` for undirected, groups `8 4` dashed header 22px. See `docs/04-rendering.md`, `docs/05-layout.md`.

## 8. Formatting
Canonical formatter `A->B → A -> B`, `B -> C:hi → B -> C : hi`, groups indent 2, comments `// ` normalized, blanks collapsed, final newline, idempotent `format(format(src))==format(src)`. See `docs/07-formatting.md`.

## 9. Editor & Tooling
Language services editor-independent `src/language/*`: diagnostics, completion (direction after `direction`, types in `[]`, ids after `->`), hover, symbols hierarchical, definition/references/rename, format/highlight/indent/folding. CLI `floe check/format/render/lsp` exit 0/1/2. LSP `src/lsp/server.ts` stdio JSON-RPC with capabilities `textDocumentSync openClose:true change:1 save, completionProvider [" ","[","-",">",":"], hover, definition, references, rename prepare, formatting, symbols, folding, diagnosticProvider`. See `docs/09-editor-integration.md`, `docs/10-cli.md`, `docs/11-lsp.md`.

## 10. Security
Untrusted `.floe` never executed; no `eval`/`new Function`, SVG `escapeXml/Attr/Id`, `sanitizeUrl` allows only `https?://|mailto:|/path|relative`, `javascript:/data:/vbscript:` flagged E014. See `docs/security.md`.

## 11. Versioning
SemVer after 1.0; breaking syntax changes require major bump + migration. See `docs/versioning.md`.

Full details in `docs/` suite 01–12. This SPEC is frozen for v1.0.
