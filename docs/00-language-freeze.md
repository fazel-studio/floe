# Floe v1.0 — Language Freeze

**Status: Frozen** — 2026-09-05  
**Spec source:** `SPEC.md` (v0.1 + v0.3 amendments) is the frozen grammar for v1.0.

## Principle
v1.0 is stabilization, not feature maximization. The grammar below is **stable**. Users may create `.floe` files without expecting basic syntax or core semantic model to change unexpectedly.

Breaking syntax changes after v1.0 require a migration strategy and a major version bump (see `versioning.md`).

## Frozen Grammar (EBNF)

```ebnf
Program       ::= (Statement | NEWLINE | COMMENT)* EOF
Statement     ::= DirectionStmt | NodeStmt | EdgeStmt | GroupStmt | MetadataStmt | AnnotationStmt | LinkStmt
DirectionStmt ::= "direction" Direction
Direction     ::= "TB" | "BT" | "LR" | "RL"
NodeStmt      ::= IDENT ("[" IDENT "]")? (STRING)?
EdgeStmt      ::= IDENT EdgeOp IDENT (":" Label)?
EdgeOp        ::= "->" | "--"
GroupStmt     ::= "group" IDENT ("[" IDENT "]")? (STRING)? "{" GroupBody "}"
GroupBody     ::= (Statement | NEWLINE | COMMENT)*
MetadataStmt  ::= "meta" IDENT "=" STRING
AnnotationStmt::= "note" (IDENT)? STRING
LinkStmt      ::= "link" IDENT STRING
IDENT         ::= [A-Za-z_][A-Za-z0-9_-]*
STRING        ::= '"' ( [^"\n] | '\"' | '\\' | '\n' | '\t' )* '"'
```

See `SPEC.md` for full.
