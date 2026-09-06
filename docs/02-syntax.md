# Floe — Syntax (v1.0)

Line-oriented, UTF-8 (`\n` or `\r\n`), blank lines ignored, `//` comment to end-of-line.

## Tokens
```
IDENT         ::= [A-Za-z_][A-Za-z0-9_-]*   // pattern ^[A-Za-z_][A-Za-z0-9_-]*$
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

Whitespace (` `, `\t`) is separator only; not inside tokens except inside edge label after `:`.

## Statements (one per non-blank line)
```ebnf
Statement ::= DirectionStmt | NodeStmt | EdgeStmt | GroupStmt | MetadataStmt | AnnotationStmt | LinkStmt
DirectionStmt ::= "direction" ("TB"|"BT"|"LR"|"RL")
NodeStmt      ::= IDENT ("[" IDENT "]")? (STRING)?
EdgeStmt      ::= IDENT ("->"|"--") IDENT (":" Label)?
GroupStmt     ::= "group" IDENT ("[" IDENT "]")? (STRING)? "{" GroupBody "}"
GroupBody     ::= (Statement | NEWLINE | COMMENT)*
MetadataStmt  ::= "meta" IDENT "=" STRING
AnnotationStmt::= "note" (IDENT)? STRING
LinkStmt      ::= "link" IDENT STRING
```

## Identifier Rules
- Must match `^[A-Za-z_][A-Za-z0-9_-]*$`
- Start with letter or `_`, not digit
- May contain hyphen `-` and underscore `_`
- No spaces, no Unicode beyond ASCII (>127 → `E007`)
- Case-sensitive, no empty

Display labels are separate — use quoted `STRING` after node: `API [service] "API Gateway"` — never put spaces in id.

## Examples
**Valid:**
```floe
direction LR
User [person] "End User"
API [service] "API Gateway"
User -> Login
Login -> Dashboard : success
Cache -- Database : associated
group Backend {
  API
  Database
}
meta author = "Alice"
note "Global note"
note API "Handles auth"
link API "https://api.example.com"
```

**Invalid:**
```floe
direction XX           // E001
123User -> Login        // E002
User [person]
User [service]         // E003 duplicate node
direction LR
direction TB           // E004 duplicate direction
-> Login               // E005 malformed
direction              // E006 incomplete
User$ -> Login         // E007 invalid char
User []                // E008 empty type
User ->                // E009 missing target
A -> B :               // E010 empty label
group A {}
group A {}             // E011 duplicate group
group A {              // E012 unclosed
meta author "Alice"    // E013 invalid meta (missing =)
note Unknown "x"       // E014 unknown target (if Unknown not exists)
```

See `00-language-freeze.md` for per-feature valid/invalid tables and `SPEC.md` for full spec.
