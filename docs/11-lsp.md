# Floe — LSP (v1.0)

**Server:** `src/lsp/server.ts` → `FloeLspServer` (Node, stdio JSON-RPC)  
**Reuse:** `src/language/*` (diagnostics, completion, hover, definition, references, rename, formatting, symbols, folding)

## Launch
```bash
floe lsp --stdio
node ./dist/src/cli/main.js lsp --stdio
# or via editor config:
# vscode: "floe.server.path": "floe"
# neovim: lspconfig.floe.setup { cmd = {"floe","lsp","--stdio"} }
```

## Capabilities (advertised on `initialize`)
```json
{
  "textDocumentSync": { "openClose": true, "change": 1, "save": {} },
  "completionProvider": { "triggerCharacters": [" ","[","-",">",":"], "resolveProvider": false },
  "hoverProvider": true,
  "definitionProvider": true,
  "referencesProvider": true,
  "renameProvider": { "prepareProvider": true },
  "documentFormattingProvider": true,
  "documentSymbolProvider": true,
  "foldingRangeProvider": true,
  "diagnosticProvider": { "interFileDependencies": false, "workspaceDiagnostics": false }
}
```

## Handlers
- `textDocument/didOpen` → open in `DocumentManager`, publishDiagnostics
- `didChange` → full or incremental (`contentChanges` with `range`) via `applyIncremental`, publishDiagnostics
- `didClose` → clear diagnostics
- `didSave` → re-validate
- `initialize` → returns capabilities + `serverInfo: {name:"floe-lsp", version:"1.0.0"}`
- `shutdown`/`exit` → graceful

Requests reuse language services:
- `completion` → `getCompletions(offset)` → LSP `CompletionItem` with `kind` mapping
- `hover` → `getHover(offset)` → markdown `contents` + range
- `definition` → `getDefinition(offset)` → `Location`
- `references` → `getReferences(offset)` → `Location[]`
- `rename` → `rename(offset,newName)` → `WorkspaceEdit {changes:{uri: TextEdit[]}}` (reject invalid `newName` → null)
- `formatting` → `format(text)` → single `TextEdit` covering document
- `documentSymbol` → `getSymbols(text)` → `DocumentSymbol[]` hierarchical
- `foldingRange` → `getFoldingRanges(text)` → `FoldingRange[]`

## Document Management (`src/lsp/documents.ts`)
- Stores `uri → {languageId, version, text}`
- `offset ↔ LSP position` via `lspPositionToOffset` / `offsetToLspPosition` (accounts for `\r\n`)
- Incremental edits apply sorted ranges correctly

## Security
- Never executes `.floe` content; `getDiagnostics` etc. are pure.
- Diagnostics published as `textDocument/publishDiagnostics` with `source:"floe"`.

See `tests/lsp.test.ts:1` for coverage (diagnostics, completion, hover, definition, references, rename, formatting, symbols, folding, incremental).
