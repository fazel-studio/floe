import { Lexer } from "./lexer.js";
import { diag } from "./diagnostics.js";
import { DEFAULT_DIRECTION, DIRECTIONS } from "./types.js";
/**
 * Floe grammar-based parser
 *
 * Grammar (EBNF):
 *   Program       ::= (Statement | NEWLINE | COMMENT)* EOF
 *   Statement     ::= DirectionStmt | NodeStmt | EdgeStmt | GroupStmt | MetadataStmt | AnnotationStmt | LinkStmt
 *   DirectionStmt ::= "direction" Direction
 *   Direction     ::= "TB" | "BT" | "LR" | "RL"
 *   NodeStmt      ::= IDENT ("[" IDENT "]")? (STRING)?
 *   EdgeStmt      ::= IDENT EdgeOp IDENT (":" Label)?
 *   EdgeOp        ::= "->" | "--"
 *   Label         ::= <trimmed raw slice after ":">  (non-empty) OR STRING decoded
 *   GroupStmt     ::= "group" IDENT ("[" IDENT "]")? (STRING)? "{" GroupBody "}"
 *   GroupBody     ::= (Statement | NEWLINE | COMMENT)*
 *   MetadataStmt  ::= "meta" IDENT "=" STRING
 *   AnnotationStmt::= "note" (IDENT)? STRING
 *   LinkStmt      ::= "link" IDENT STRING
 *
 * Features:
 * - source ranges for all nodes/edges/groups
 * - syntax error reporting with stable codes (E001-E014)
 * - recovery via synchronization to next NEWLINE or RBRACE
 * - never crashes on malformed input
 * - nested groups supported
 */
export class Parser {
    source;
    tokens;
    idx = 0;
    diagnostics = [];
    explicitNodes = [];
    edges = [];
    direction = DEFAULT_DIRECTION;
    directionRange;
    directionSeen = false;
    directionDeclarations = [];
    // v0.3 fields
    groups = [];
    groupStack = [];
    metadata = {};
    metadataRanges = new Map();
    annotations = [];
    links = [];
    linkMap = new Map();
    constructor(source) {
        this.source = source;
        this.tokens = new Lexer(source).tokenize();
    }
    parse() {
        try {
            this.loop();
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const pos = this.peek().range.start;
            this.diagnostics.push(diag("error", "E005", `Internal parser error: ${msg}`, {
                start: pos,
                end: pos,
            }));
        }
        // Handle unclosed groups (missing })
        for (const grp of this.groupStack) {
            this.diagnostics.push(diag("error", "E012", `Unclosed group '${grp.id}': missing closing '}'`, grp.range));
            // Treat as closed at EOF
        }
        // Include remaining unclosed groups as if closed (they are already in hierarchy)
        // groupStack should be cleared
        // Note: groups[] already contains them via hierarchy, but top-level groups already inserted
        // No extra needed; just clear stack
        this.groupStack = [];
        // Build full node list: explicit + implicit from edges
        const nodeMap = new Map();
        for (const n of this.explicitNodes) {
            if (!nodeMap.has(n.id))
                nodeMap.set(n.id, n);
        }
        for (const e of this.edges) {
            if (!nodeMap.has(e.source)) {
                nodeMap.set(e.source, {
                    id: e.source,
                    range: e.sourceRange,
                });
            }
            if (!nodeMap.has(e.target)) {
                nodeMap.set(e.target, {
                    id: e.target,
                    range: e.targetRange,
                });
            }
        }
        const nodes = Array.from(nodeMap.values());
        const diagram = {
            direction: this.direction,
            directionRange: this.directionRange,
            nodes,
            edges: this.edges,
            groups: this.groups,
            metadata: this.metadata,
            annotations: this.annotations,
            links: this.links,
        };
        this.diagnostics.sort((a, b) => a.range.start.offset - b.range.start.offset);
        return {
            diagram,
            diagnostics: this.diagnostics,
            explicitNodes: this.explicitNodes,
            edges: this.edges,
            directionDeclarations: this.directionDeclarations,
            groups: this.groups,
            metadata: this.metadata,
            annotations: this.annotations,
            links: this.links,
        };
    }
    currentGroup() {
        if (this.groupStack.length === 0)
            return undefined;
        return this.groupStack[this.groupStack.length - 1];
    }
    peek() {
        return this.tokens[this.idx] ?? this.tokens[this.tokens.length - 1];
    }
    previous() {
        return this.tokens[Math.max(0, this.idx - 1)];
    }
    isAtEnd() {
        return this.peek().type === "EOF";
    }
    check(type) {
        if (this.isAtEnd() && type !== "EOF")
            return false;
        return this.peek().type === type;
    }
    advance() {
        if (!this.isAtEnd())
            this.idx++;
        return this.previous();
    }
    match(type) {
        if (this.check(type)) {
            this.advance();
            return true;
        }
        return false;
    }
    codeForUnexpected(tok) {
        if (tok.type === "UNKNOWN") {
            if (/^[0-9]/.test(tok.lexeme))
                return "E002";
            return "E007";
        }
        return "E005";
    }
    synchronize() {
        // Skip until NEWLINE, RBRACE, COMMENT or EOF
        while (!this.isAtEnd()) {
            if (this.check("NEWLINE")) {
                this.advance();
                return;
            }
            if (this.check("RBRACE")) {
                // Do not consume RBRACE here; let loop handle group close
                return;
            }
            if (this.check("COMMENT")) {
                this.advance();
                if (this.check("NEWLINE"))
                    this.advance();
                return;
            }
            this.advance();
        }
    }
    loop() {
        while (!this.isAtEnd()) {
            if (this.match("NEWLINE"))
                continue;
            if (this.match("COMMENT")) {
                continue;
            }
            // Handle closing brace for groups
            if (this.check("RBRACE")) {
                const tok = this.advance();
                const grp = this.groupStack.pop();
                if (!grp) {
                    this.diagnostics.push(diag("error", "E005", `Unexpected '}' without matching 'group'`, tok.range));
                }
                else {
                    // Update group's range to include closing brace
                    grp.range = { start: grp.range.start, end: tok.range.end };
                }
                continue;
            }
            if (this.check("UNKNOWN")) {
                const bad = this.advance();
                // Distinguish unterminated string: lexeme starts with "
                if (bad.lexeme.startsWith('"')) {
                    this.diagnostics.push(diag("error", "E006", `Unterminated string: missing closing '"'`, bad.range));
                }
                else {
                    const isDigitStart = /^[0-9]/.test(bad.lexeme);
                    if (isDigitStart) {
                        this.diagnostics.push(diag("error", "E002", `Invalid identifier '${bad.lexeme}': must start with a letter or underscore`, bad.range));
                    }
                    else {
                        this.diagnostics.push(diag("error", "E007", `Invalid character '${bad.lexeme}'`, bad.range));
                    }
                }
                this.synchronize();
                continue;
            }
            if (this.check("DIRECTION_KW")) {
                this.parseDirectionStmt();
                continue;
            }
            if (this.check("GROUP_KW")) {
                this.parseGroupStmt();
                continue;
            }
            if (this.check("META_KW")) {
                this.parseMetadataStmt();
                continue;
            }
            if (this.check("NOTE_KW")) {
                this.parseAnnotationStmt();
                continue;
            }
            if (this.check("LINK_KW")) {
                this.parseLinkStmt();
                continue;
            }
            if (this.check("IDENT")) {
                const look = this.tokens[this.idx + 1];
                if (!look) {
                    this.parseNodeStmt();
                    continue;
                }
                if (look.type === "ARROW" || look.type === "DASHDASH") {
                    this.parseEdgeStmt();
                    continue;
                }
                if (look.type === "LBRACKET") {
                    this.parseNodeStmt();
                    continue;
                }
                if (look.type === "STRING") {
                    // Could be node with label: IDENT STRING
                    // Peek ahead after STRING to see if next is ARROW/DASHDASH? e.g., API "label" -> B ? That's unlikely but treat as node for now
                    // If after IDENT STRING there is ARROW, then this IDENT would be edge source; but we already checked next is STRING not ARROW, so it's node.
                    this.parseNodeStmt();
                    continue;
                }
                if (look.type === "NEWLINE" ||
                    look.type === "COMMENT" ||
                    look.type === "EOF" ||
                    look.type === "RBRACE") {
                    this.parseNodeStmt();
                    continue;
                }
                if (look.type === "COLON") {
                    const idTok = this.advance();
                    const colon = this.advance();
                    this.diagnostics.push(diag("error", "E005", `Malformed statement: expected '->' or '--' between identifiers before ':'`, { start: idTok.range.start, end: colon.range.end }));
                    this.synchronize();
                    continue;
                }
                this.parseNodeStmt();
                continue;
            }
            {
                const tok = this.advance();
                this.diagnostics.push(diag("error", "E005", `Unexpected token '${tok.lexeme}' at start of statement`, tok.range));
                this.synchronize();
                continue;
            }
        }
    }
    parseDirectionStmt() {
        const kw = this.advance(); // DIRECTION_KW
        if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
            this.diagnostics.push(diag("error", "E006", `Incomplete direction statement: expected one of ${DIRECTIONS.join(", ")} after 'direction'`, kw.range));
            return;
        }
        let dirTok = null;
        if (this.check("IDENT") || this.check("UNKNOWN")) {
            dirTok = this.advance();
        }
        else {
            const tok = this.advance();
            this.diagnostics.push(diag("error", "E005", `Unexpected token '${tok.lexeme}' after 'direction'; expected one of ${DIRECTIONS.join(", ")}`, tok.range));
            this.synchronize();
            return;
        }
        const raw = dirTok.lexeme;
        const isValid = DIRECTIONS.includes(raw);
        const declRange = { start: kw.range.start, end: dirTok.range.end };
        this.directionDeclarations.push({ value: raw, range: declRange, rawLexeme: raw });
        if (!isValid) {
            if (/^[0-9]/.test(raw)) {
                this.diagnostics.push(diag("error", "E002", `Invalid identifier '${raw}' for direction; expected one of ${DIRECTIONS.join(", ")}`, dirTok.range));
            }
            else {
                this.diagnostics.push(diag("error", "E001", `Invalid direction '${raw}': expected one of ${DIRECTIONS.join(", ")}`, dirTok.range));
            }
            if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
                const extra = this.peek();
                this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after direction value`, extra.range));
                this.synchronize();
            }
            return;
        }
        const newDirection = raw;
        this.direction = newDirection;
        this.directionRange = declRange;
        this.directionSeen = true;
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after direction value`, extra.range));
            this.synchronize();
        }
    }
    parseGroupStmt() {
        const kw = this.advance(); // GROUP_KW
        let start = kw.range.start;
        let end = kw.range.end;
        // Expect group id IDENT
        if (this.check("IDENT")) {
            const idTok = this.advance();
            const id = idTok.lexeme;
            let type;
            let label;
            let labelRange;
            let headerEnd = idTok.range.end;
            // Optional type [IDENT]
            if (this.check("LBRACKET")) {
                const lb = this.advance();
                if (this.check("IDENT")) {
                    const typeTok = this.advance();
                    type = typeTok.lexeme;
                    if (this.check("RBRACKET")) {
                        const rb = this.advance();
                        headerEnd = rb.range.end;
                    }
                    else {
                        this.diagnostics.push(diag("error", "E006", `Missing closing ']' for group type after '${typeTok.lexeme}'`, { start: lb.range.start, end: typeTok.range.end }));
                        headerEnd = typeTok.range.end;
                        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("LBRACE") && !this.check("STRING")) {
                            const nxt = this.peek();
                            // Only report if not terminator
                            if (nxt.type !== "NEWLINE" && nxt.type !== "COMMENT" && nxt.type !== "EOF" && nxt.type !== "LBRACE" && nxt.type !== "STRING") {
                                this.diagnostics.push(diag("error", this.codeForUnexpected(nxt), `Unexpected token '${nxt.lexeme}' after group type`, nxt.range));
                                this.synchronize();
                            }
                        }
                    }
                }
                else if (this.check("UNKNOWN")) {
                    const bad = this.advance();
                    const isDigitStart = /^[0-9]/.test(bad.lexeme);
                    this.diagnostics.push(diag("error", isDigitStart ? "E002" : "E008", `Invalid group type '${bad.lexeme}'`, bad.range));
                    headerEnd = bad.range.end;
                    if (this.check("RBRACKET")) {
                        const rb = this.advance();
                        headerEnd = rb.range.end;
                    }
                    else {
                        this.diagnostics.push(diag("error", "E006", `Missing closing ']' after invalid group type`, { start: lb.range.start, end: bad.range.end }));
                    }
                    if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("LBRACE") && !this.check("STRING")) {
                        const nxt = this.peek();
                        this.diagnostics.push(diag("error", this.codeForUnexpected(nxt), `Unexpected token '${nxt.lexeme}' after group type`, nxt.range));
                        this.synchronize();
                    }
                }
                else if (this.check("RBRACKET")) {
                    const rb = this.advance();
                    this.diagnostics.push(diag("error", "E008", `Empty group type: expected identifier inside brackets`, { start: lb.range.start, end: rb.range.end }));
                    headerEnd = rb.range.end;
                }
                else if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("LBRACE") || this.check("STRING")) {
                    this.diagnostics.push(diag("error", "E006", `Incomplete group declaration: expected type identifier and ']' after '['`, lb.range));
                    headerEnd = lb.range.end;
                }
                else {
                    const tok = this.advance();
                    this.diagnostics.push(diag("error", this.codeForUnexpected(tok), `Unexpected token '${tok.lexeme}' inside group type brackets`, tok.range));
                    if (this.check("RBRACKET")) {
                        const rb = this.advance();
                        headerEnd = rb.range.end;
                    }
                    else {
                        this.synchronize();
                        headerEnd = tok.range.end;
                        // Create group with whatever we have and return early without expecting brace?
                        // But we need to attempt to create group
                    }
                }
            }
            // Optional label STRING
            if (this.check("STRING")) {
                const labelTok = this.advance();
                label = labelTok.lexeme;
                labelRange = labelTok.range;
                headerEnd = labelTok.range.end;
                end = headerEnd;
            }
            else {
                end = headerEnd;
            }
            // Expect LBRACE
            let hasBrace = false;
            let braceRange;
            if (this.check("LBRACE")) {
                const lb = this.advance();
                braceRange = lb.range;
                end = lb.range.end;
                hasBrace = true;
            }
            else {
                this.diagnostics.push(diag("error", "E006", `Missing opening '{' for group '${id}'`, { start: start, end: headerEnd }));
                // Alternative E012 also
                // Do not push to stack? Should still create group but treat as if brace missing, so we still push but warn
                // For recovery, if missing brace, we won't push to stack to avoid swallowing rest of file into group.
                // But spec allows groups without brace as error; we will still create group but not push
                if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
                    // If next token is not newline, maybe we should synchronize?
                    // For now just push diagnostic and synchronize
                    // Don't create group with missing brace as container
                }
                // create group without brace - not pushed to stack, just top-level placeholder? Better still push but require closing?
                // Decide: if brace missing, create group but not push; errors will be reported later as unclosed.
                // Let's create group and NOT push to avoid swallowing file
                const grp = {
                    id,
                    label,
                    type,
                    range: { start, end: headerEnd },
                    nodeIds: [],
                    groups: [],
                    metadata: {},
                    annotations: [],
                    parentId: this.currentGroup()?.id,
                };
                // Validate id already? Duplicate check in validator
                const parent = this.currentGroup();
                if (parent)
                    parent.groups.push(grp);
                else
                    this.groups.push(grp);
                // Check extra after header without brace
                if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
                    const extra = this.peek();
                    this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after group header`, extra.range));
                    this.synchronize();
                }
                return;
            }
            // Create group object
            const grp = {
                id,
                label,
                type,
                range: { start, end },
                nodeIds: [],
                groups: [],
                metadata: {},
                annotations: [],
                parentId: this.currentGroup()?.id,
            };
            // Add to parent or top-level
            const parent = this.currentGroup();
            if (parent)
                parent.groups.push(grp);
            else
                this.groups.push(grp);
            // Push onto stack
            this.groupStack.push(grp);
            // Check for extra tokens before newline after brace (should be none except comment)
            if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
                const extra = this.peek();
                // If next token is not at line end but could be start of body on same line? Our spec requires newline after {
                // But allow body on same line? For simplicity, allow statements after brace without newline? Better require newline but we can just allow and continue
                // If extra is IDENT etc that could be body, we should not error if brace is followed immediately by content without newline (unlikely but possible: "group X { API }")
                // To support same-line body, we should not error if extra can start a statement inside group.
                // So we allow if extra is IDENT/GROUP_KW/META_KW/NOTE_KW/LINK_KW/DIRECTION_KW etc., don't flag.
                // Only flag if extra is unexpected like UNKNOWN
                const starterTypes = ["IDENT", "GROUP_KW", "META_KW", "NOTE_KW", "LINK_KW", "DIRECTION_KW", "RBRACE"];
                if (!starterTypes.includes(extra.type)) {
                    this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after '{'`, extra.range));
                    this.synchronize();
                }
                // else allow body to be parsed next loop iteration (even without newline)
            }
            return;
        }
        else if (this.check("UNKNOWN")) {
            const bad = this.advance();
            const isDigitStart = /^[0-9]/.test(bad.lexeme);
            this.diagnostics.push(diag("error", isDigitStart ? "E002" : "E007", `Invalid identifier '${bad.lexeme}' for group id`, bad.range));
            this.synchronize();
            return;
        }
        else if (this.check("LBRACE")) {
            // Missing id, but has brace: `group {`
            this.diagnostics.push(diag("error", "E006", `Missing group identifier after 'group'`, kw.range));
            // Consume brace and create placeholder? But for recovery, just consume brace and continue without creating group
            this.advance(); // consume {
            // Create anonymous group? skip
            this.diagnostics.push(diag("error", "E005", `Group without identifier ignored`, kw.range));
            return;
        }
        else if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
            this.diagnostics.push(diag("error", "E006", `Missing group identifier after 'group'`, kw.range));
            return;
        }
        else {
            const tok = this.advance();
            this.diagnostics.push(diag("error", this.codeForUnexpected(tok), `Unexpected token '${tok.lexeme}' after 'group'`, tok.range));
            this.synchronize();
            return;
        }
    }
    parseMetadataStmt() {
        const kw = this.advance(); // META_KW
        let start = kw.range.start;
        let end = kw.range.end;
        // Expect IDENT key
        if (!this.check("IDENT")) {
            if (this.check("UNKNOWN")) {
                const bad = this.advance();
                this.diagnostics.push(diag("error", "E002", `Invalid identifier '${bad.lexeme}' for metadata key`, bad.range));
                this.synchronize();
                return;
            }
            this.diagnostics.push(diag("error", "E006", `Missing metadata key after 'meta'`, kw.range));
            this.synchronize();
            return;
        }
        const keyTok = this.advance();
        const key = keyTok.lexeme;
        end = keyTok.range.end;
        // Expect EQUALS
        if (!this.check("EQUALS")) {
            this.diagnostics.push(diag("error", "E006", `Missing '=' after metadata key '${key}'`, { start: kw.range.start, end: keyTok.range.end }));
            this.synchronize();
            return;
        }
        const eq = this.advance();
        end = eq.range.end;
        // Expect STRING value
        if (!this.check("STRING")) {
            if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
                this.diagnostics.push(diag("error", "E006", `Missing value for metadata key '${key}': expected quoted string`, eq.range));
                return;
            }
            const tok = this.advance();
            // If UNKNOWN that is unterminated string, already flagged as UNKNOWN starting with "
            if (tok.lexeme.startsWith('"')) {
                this.diagnostics.push(diag("error", "E006", `Unterminated string for metadata key '${key}'`, tok.range));
            }
            else {
                this.diagnostics.push(diag("error", "E013", `Invalid metadata value for '${key}': expected quoted string, got '${tok.lexeme}'`, tok.range));
            }
            this.synchronize();
            return;
        }
        const valTok = this.advance();
        const value = valTok.lexeme;
        end = valTok.range.end;
        // Check extra tokens
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after metadata value`, extra.range));
            this.synchronize();
        }
        const metaRange = { start, end };
        const cur = this.currentGroup();
        if (cur) {
            // check duplicate within group
            if (cur.metadata.hasOwnProperty(key)) {
                // validator will flag? But we emit warning here as E013?
                // For now allow override, but could diag
            }
            cur.metadata[key] = value;
        }
        else {
            if (this.metadata.hasOwnProperty(key)) {
                // duplicate key at diagram level - validator will handle? But emit E013?
            }
            this.metadata[key] = value;
            this.metadataRanges.set(key, metaRange);
        }
    }
    parseAnnotationStmt() {
        const kw = this.advance(); // NOTE_KW
        let start = kw.range.start;
        let end = kw.range.end;
        let target;
        let text;
        let textRange;
        // Two forms: note STRING  or note IDENT STRING
        if (this.check("STRING")) {
            const t = this.advance();
            text = t.lexeme;
            textRange = t.range;
            end = t.range.end;
        }
        else if (this.check("IDENT")) {
            const idTok = this.advance();
            target = idTok.lexeme;
            end = idTok.range.end;
            if (this.check("STRING")) {
                const t = this.advance();
                text = t.lexeme;
                textRange = t.range;
                end = t.range.end;
            }
            else {
                // Missing text
                if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
                    this.diagnostics.push(diag("error", "E006", `Missing annotation text after target '${target}': expected quoted string`, idTok.range));
                    return;
                }
                const tok = this.advance();
                if (tok.lexeme.startsWith('"')) {
                    this.diagnostics.push(diag("error", "E006", `Unterminated string for annotation`, tok.range));
                }
                else {
                    this.diagnostics.push(diag("error", "E014", `Invalid annotation text: expected quoted string, got '${tok.lexeme}'`, tok.range));
                }
                this.synchronize();
                return;
            }
        }
        else {
            // No IDENT nor STRING
            if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
                this.diagnostics.push(diag("error", "E006", `Incomplete note statement: expected quoted string or target identifier`, kw.range));
                return;
            }
            if (this.check("UNKNOWN")) {
                const bad = this.advance();
                if (bad.lexeme.startsWith('"')) {
                    this.diagnostics.push(diag("error", "E006", `Unterminated string for annotation`, bad.range));
                }
                else {
                    const isDigit = /^[0-9]/.test(bad.lexeme);
                    this.diagnostics.push(diag("error", isDigit ? "E002" : "E007", `Invalid identifier '${bad.lexeme}' for annotation target`, bad.range));
                }
                this.synchronize();
                return;
            }
            const tok = this.advance();
            this.diagnostics.push(diag("error", "E005", `Unexpected token '${tok.lexeme}' after 'note'`, tok.range));
            this.synchronize();
            return;
        }
        // Validate text non-empty? Empty string "" would be allowed? Spec says annotation text should be non-empty; we treat empty as E014
        if (text !== undefined && text.trim().length === 0) {
            this.diagnostics.push(diag("error", "E014", `Empty annotation text`, textRange));
            // Still store? Allow but flagged
        }
        // Check extra tokens
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after annotation`, extra.range));
            this.synchronize();
        }
        const annRange = { start, end };
        const ann = { target, text: text, range: annRange };
        this.annotations.push(ann);
        const cur = this.currentGroup();
        if (cur)
            cur.annotations.push(ann);
    }
    parseLinkStmt() {
        const kw = this.advance(); // LINK_KW
        let start = kw.range.start;
        let end = kw.range.end;
        // Expect IDENT target
        if (!this.check("IDENT")) {
            if (this.check("UNKNOWN")) {
                const bad = this.advance();
                this.diagnostics.push(diag("error", "E002", `Invalid identifier '${bad.lexeme}' for link target`, bad.range));
                this.synchronize();
                return;
            }
            this.diagnostics.push(diag("error", "E006", `Missing link target after 'link': expected identifier`, kw.range));
            this.synchronize();
            return;
        }
        const targetTok = this.advance();
        const target = targetTok.lexeme;
        end = targetTok.range.end;
        // Expect STRING url
        if (!this.check("STRING")) {
            if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
                this.diagnostics.push(diag("error", "E006", `Missing URL for link target '${target}': expected quoted string`, targetTok.range));
                return;
            }
            const tok = this.advance();
            if (tok.lexeme.startsWith('"')) {
                this.diagnostics.push(diag("error", "E006", `Unterminated string for link URL`, tok.range));
            }
            else {
                this.diagnostics.push(diag("error", "E014", `Invalid link URL: expected quoted string, got '${tok.lexeme}'`, tok.range));
            }
            this.synchronize();
            return;
        }
        const urlTok = this.advance();
        const url = urlTok.lexeme;
        end = urlTok.range.end;
        if (url.trim().length === 0) {
            this.diagnostics.push(diag("error", "E014", `Empty link URL for target '${target}'`, urlTok.range));
        }
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after link`, extra.range));
            this.synchronize();
        }
        const range = { start, end };
        const link = { target, url, range };
        // Check duplicate
        if (this.linkMap.has(target)) {
            // Duplicate link for same target - validator will handle or we diag
            this.diagnostics.push(diag("error", "E014", `Duplicate link for target '${target}'`, range));
        }
        else {
            this.linkMap.set(target, link);
            this.links.push(link);
            // If target is a group id, also set group.link
            const grp = this.findGroupById(target);
            if (grp)
                grp.link = url;
        }
    }
    findGroupById(id) {
        // search recursively in groups
        const search = (arr) => {
            for (const g of arr) {
                if (g.id === id)
                    return g;
                const found = search(g.groups);
                if (found)
                    return found;
            }
            return undefined;
        };
        return search(this.groups);
    }
    parseNodeStmt() {
        const idTok = this.advance(); // IDENT
        let start = idTok.range.start;
        let end = idTok.range.end;
        let type;
        let label;
        let labelRange;
        if (this.check("LBRACKET")) {
            const lb = this.advance();
            if (this.check("IDENT")) {
                const typeTok = this.advance();
                type = typeTok.lexeme;
                if (this.check("RBRACKET")) {
                    const rb = this.advance();
                    end = rb.range.end;
                }
                else {
                    this.diagnostics.push(diag("error", "E006", `Missing closing ']' for node type after '${typeTok.lexeme}'`, { start: lb.range.start, end: typeTok.range.end }));
                    end = typeTok.range.end;
                    if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE") && !this.check("STRING")) {
                        const nxt = this.peek();
                        if (nxt.type !== "NEWLINE" && nxt.type !== "COMMENT" && nxt.type !== "EOF" && nxt.type !== "RBRACE" && nxt.type !== "STRING") {
                            this.diagnostics.push(diag("error", this.codeForUnexpected(nxt), `Unexpected token '${nxt.lexeme}' after node type`, nxt.range));
                            this.synchronize();
                        }
                    }
                }
            }
            else if (this.check("UNKNOWN")) {
                const bad = this.advance();
                const isDigitStart = /^[0-9]/.test(bad.lexeme);
                if (isDigitStart) {
                    this.diagnostics.push(diag("error", "E002", `Invalid identifier '${bad.lexeme}' for node type: must start with a letter or underscore`, bad.range));
                }
                else {
                    this.diagnostics.push(diag("error", "E008", `Invalid node type '${bad.lexeme}'`, bad.range));
                }
                end = bad.range.end;
                if (this.check("RBRACKET")) {
                    const rb = this.advance();
                    end = rb.range.end;
                }
                else {
                    this.diagnostics.push(diag("error", "E006", `Missing closing ']' after invalid node type`, { start: lb.range.start, end: bad.range.end }));
                }
                if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE") && !this.check("STRING")) {
                    const nxt = this.peek();
                    this.diagnostics.push(diag("error", this.codeForUnexpected(nxt), `Unexpected token '${nxt.lexeme}' after node type`, nxt.range));
                    this.synchronize();
                }
            }
            else if (this.check("RBRACKET")) {
                const rb = this.advance();
                this.diagnostics.push(diag("error", "E008", `Empty node type: expected identifier inside brackets`, { start: lb.range.start, end: rb.range.end }));
                end = rb.range.end;
                if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE") && !this.check("STRING")) {
                    const nxt = this.peek();
                    this.diagnostics.push(diag("error", this.codeForUnexpected(nxt), `Unexpected token '${nxt.lexeme}' after node declaration`, nxt.range));
                    this.synchronize();
                }
            }
            else if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE") || this.check("STRING")) {
                // STRING could be label after missing bracket close? e.g., Node [ "label"
                // But treat as missing bracket before label
                this.diagnostics.push(diag("error", "E006", `Incomplete node declaration: expected type identifier and ']' after '['`, lb.range));
                end = lb.range.end;
                // Do not consume string yet; fall through to label handling
            }
            else {
                const tok = this.advance();
                this.diagnostics.push(diag("error", this.codeForUnexpected(tok), `Unexpected token '${tok.lexeme}' inside node type brackets`, tok.range));
                if (this.check("RBRACKET")) {
                    const rb = this.advance();
                    end = rb.range.end;
                }
                else {
                    this.synchronize();
                    const nodeRange = { start, end };
                    this.pushNode({ id: idTok.lexeme, type, label, range: nodeRange });
                    return;
                }
            }
        }
        // Optional display label STRING
        if (this.check("STRING")) {
            const labelTok = this.advance();
            label = labelTok.lexeme;
            labelRange = labelTok.range;
            end = labelTok.range.end;
            // Validate label non-empty already: empty string "" would be lexeme "" (empty after trimming?), we could flag E010-like
            if (label.trim().length === 0) {
                this.diagnostics.push(diag("error", "E010", `Empty display label for node '${idTok.lexeme}'`, labelTok.range));
            }
        }
        // After node (and optional label), check for extra tokens before line end
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after node declaration`, extra.range));
            this.synchronize();
        }
        const nodeRange = { start, end };
        this.pushNode({ id: idTok.lexeme, type, label, range: nodeRange });
    }
    pushNode(node) {
        this.explicitNodes.push(node);
        const cur = this.currentGroup();
        if (cur) {
            cur.nodeIds.push(node.id);
        }
    }
    parseEdgeStmt() {
        const sourceTok = this.advance(); // IDENT
        // Expect ARROW or DASHDASH
        let kind = "directed";
        let opTok = null;
        if (this.check("ARROW")) {
            opTok = this.advance();
            kind = "directed";
        }
        else if (this.check("DASHDASH")) {
            opTok = this.advance();
            kind = "undirected";
        }
        else {
            this.diagnostics.push(diag("error", "E005", `Missing '->' or '--' after source identifier '${sourceTok.lexeme}'`, sourceTok.range));
            this.synchronize();
            return;
        }
        // Expect target IDENT
        if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
            this.diagnostics.push(diag("error", "E009", `Missing edge target after '${opTok.lexeme}'`, opTok.range));
            this.diagnostics.push(diag("error", "E006", `Incomplete edge: expected target identifier after '${opTok.lexeme}'`, { start: sourceTok.range.start, end: opTok.range.end }));
            return;
        }
        if (this.check("UNKNOWN")) {
            const bad = this.advance();
            const isDigitStart = /^[0-9]/.test(bad.lexeme);
            this.diagnostics.push(diag("error", isDigitStart ? "E002" : "E007", isDigitStart
                ? `Invalid identifier '${bad.lexeme}' for edge target: must start with a letter or underscore`
                : `Invalid character '${bad.lexeme}' for edge target`, bad.range));
            this.synchronize();
            return;
        }
        if (!this.check("IDENT")) {
            const tok = this.advance();
            this.diagnostics.push(diag("error", "E005", `Unexpected token '${tok.lexeme}' after '${opTok.lexeme}'; expected target identifier`, tok.range));
            this.synchronize();
            return;
        }
        const targetTok = this.advance(); // IDENT
        let edgeEnd = targetTok.range.end;
        let label;
        let labelRange;
        if (this.check("COLON")) {
            const colon = this.advance();
            if (this.check("NEWLINE") || this.check("COMMENT") || this.check("EOF") || this.check("RBRACE")) {
                this.diagnostics.push(diag("error", "E010", `Empty edge label after ':'`, colon.range));
                edgeEnd = colon.range.end;
            }
            else {
                // If next token is STRING, treat that as label (decoded) and consume single STRING
                if (this.check("STRING")) {
                    const lblTok = this.advance();
                    label = lblTok.lexeme;
                    labelRange = lblTok.range;
                    edgeEnd = lblTok.range.end;
                    if (label.trim().length === 0) {
                        this.diagnostics.push(diag("error", "E010", `Empty edge label after ':'`, colon.range));
                        label = undefined;
                        labelRange = undefined;
                    }
                    // Check extra after string? Edge label after colon currently expects single string or raw; if after STRING there are more tokens before newline, that's extra? But original spec allowed any chars after colon until newline as label, so if we used STRING, we shouldn't allow extra.
                    if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
                        // If there are extra tokens after STRING label, treat them as unexpected? But original raw slice would have captured them as part of label.
                        // For consistency, we will capture remaining tokens as part of label raw if not just STRING? But if we consumed STRING as label, we should allow trailing? For now, treat extra as error.
                        // However, to preserve original behavior where label after colon includes everything, we could instead reconstruct raw if there are extra tokens.
                        // Decide: if after STRING there are more tokens, combine: label is STRING plus raw remainder?
                        // Simpler: if extra tokens exist, push error and synchronize
                        const extra = this.peek();
                        this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after edge label`, extra.range));
                        this.synchronize();
                    }
                }
                else {
                    const firstOffset = colon.range.end.offset;
                    const labelTokens = [];
                    let lastTok = null;
                    let firstTok = null;
                    while (!this.isAtEnd() &&
                        !this.check("NEWLINE") &&
                        !this.check("COMMENT") &&
                        !this.check("EOF") &&
                        !this.check("RBRACE")) {
                        const t = this.advance();
                        labelTokens.push(t);
                        lastTok = t;
                        if (!firstTok)
                            firstTok = t;
                    }
                    if (labelTokens.length === 0) {
                        this.diagnostics.push(diag("error", "E010", `Empty edge label after ':'`, colon.range));
                        edgeEnd = colon.range.end;
                    }
                    else {
                        // Handle single STRING token case already above, but if raw includes quotes? Already handled.
                        // Reconstruct raw slice
                        const endOffset = lastTok.range.end.offset;
                        const rawSlice = this.source.slice(firstOffset, endOffset);
                        const trimmed = rawSlice.trim();
                        if (trimmed.length === 0) {
                            this.diagnostics.push(diag("error", "E010", `Empty edge label after ':'`, colon.range));
                        }
                        else {
                            // If trimmed is quoted string, unwrap? Check if labelTokens is single STRING already handled, but rawSlice includes quotes - we can unwrap if needed
                            // For uniform handling, if labelTokens length==1 && labelTokens[0].type==="STRING", use decoded lexeme. But we already handled that branch.
                            // Here we are in non-STRING branch, so rawSlice may contain quoted? We'll keep as trimmed raw (preserve quotes if any) or strip outer quotes if detected
                            // If the raw trimmed starts with " and ends with ", strip? But we would have tokenized string as STRING, not raw, so not here.
                            // So just keep trimmed.
                            label = trimmed;
                            labelRange = {
                                start: firstTok.range.start,
                                end: lastTok.range.end,
                            };
                            edgeEnd = lastTok.range.end;
                        }
                    }
                }
            }
        }
        if (!this.check("NEWLINE") && !this.check("COMMENT") && !this.check("EOF") && !this.check("RBRACE")) {
            const extra = this.peek();
            this.diagnostics.push(diag("error", this.codeForUnexpected(extra), `Unexpected token '${extra.lexeme}' after edge`, extra.range));
            this.synchronize();
        }
        const edgeRange = {
            start: sourceTok.range.start,
            end: edgeEnd,
        };
        this.edges.push({
            source: sourceTok.lexeme,
            target: targetTok.lexeme,
            label,
            kind,
            range: edgeRange,
            sourceRange: sourceTok.range,
            targetRange: targetTok.range,
            labelRange,
        });
    }
}
/**
 * Convenience parse function — raw parse without semantic validation
 * For full validation use `parseFloe` from index.
 */
export function parse(source) {
    return new Parser(source).parse();
}
/**
 * Raw parse alias for validator integration
 */
export function parseRaw(source) {
    return new Parser(source).parse();
}
