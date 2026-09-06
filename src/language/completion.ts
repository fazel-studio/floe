import { tokenize } from "../lexer.js";
import { getTokenBeforeOffset, getTokenAtOffset, positionAt } from "./utils.js";
import { Parser } from "../parser.js";
import { validate } from "../validator.js";
function parseFloe(source) {
    const raw = new Parser(source).parse();
    const validated = validate({
        diagram: raw.diagram,
        diagnostics: raw.diagnostics,
        explicitNodes: raw.explicitNodes,
        edges: raw.edges,
        directionDeclarations: raw.directionDeclarations,
        groups: raw.groups,
        annotations: raw.annotations,
        links: raw.links,
    });
    return { diagram: validated.diagram, diagnostics: validated.diagnostics };
}
const DIRECTIONS = ["TB", "BT", "LR", "RL"];
const KNOWN_TYPES = [
    "person",
    "service",
    "database",
    "client",
    "subsystem",
    "external",
    "system",
    "container",
    "component",
    "queue",
    "store",
    "gateway",
];
const TOP_LEVEL_KEYWORDS = ["direction", "group", "meta", "note", "link"];
function prefixFilter(items, prefix) {
    if (!prefix)
        return items;
    const lower = prefix.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().startsWith(lower));
}
function getPrefixAtOffset(source, offset) {
    let start = offset;
    while (start > 0 && /[A-Za-z0-9_-]/.test(source[start - 1]))
        start--;
    return source.slice(start, offset);
}
/**
 * Context-aware completion — operates on semantic model, not random.
 */
export function getCompletions(source, offset) {
    const tokens = tokenize(source);
    const before = getTokenBeforeOffset(tokens, offset);
    const at = getTokenAtOffset(tokens, offset);
    const pos = positionAt(source, offset);
    const textBefore = source.slice(0, offset);
    const prefix = getPrefixAtOffset(source, offset);
    // If inside string or comment, no completions (avoid invalid syntax)
    if (at && (at.type === "STRING" || at.type === "COMMENT")) {
        return [];
    }
    // Helper to detect context requiring completion
    const trimmedBefore = textBefore.trimEnd();
    const lines = source.slice(0, offset).split(/\r?\n/);
    const currentLinePrefix = lines[lines.length - 1] ?? "";
    const trimmedLine = currentLinePrefix.trimStart();
    // 1) After "direction" keyword => suggest directions
    // Detect if last keyword before offset is "direction" and no direction value yet consumed
    // Check tokens: look backward for nearest DIRECTION_KW not followed by IDENT before offset
    {
        // Find last DIRECTION_KW before offset
        let lastDirIdx = -1;
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type === "DIRECTION_KW" && t.range.end.offset <= offset)
                lastDirIdx = i;
        }
        if (lastDirIdx !== -1) {
            const dirTok = tokens[lastDirIdx];
            // Check tokens after direction until offset: if there is no IDENT after it (direction value) then suggest
            let hasValue = false;
            let valueToken;
            for (let i = lastDirIdx + 1; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.range.start.offset >= offset)
                    break;
                if (t.type === "NEWLINE" || t.type === "COMMENT")
                    break;
                if (t.type === "IDENT" || t.type === "UNKNOWN") {
                    hasValue = true;
                    valueToken = t;
                    break;
                }
            }
            if (!hasValue) {
                const items = DIRECTIONS.map((d) => ({
                    label: d,
                    kind: "value",
                    detail: "direction",
                }));
                // When cursor is directly after keyword (offset at token end), prefix is empty for value completion
                // Don't use keyword prefix; check if we are inside a partial value token at cursor
                let valuePrefix = "";
                if (at && at.type === "IDENT" && at.range.start.offset > dirTok.range.end.offset) {
                    valuePrefix = source.slice(at.range.start.offset, offset);
                }
                else if (at && at.type === "UNKNOWN" && at.range.start.offset > dirTok.range.end.offset) {
                    valuePrefix = source.slice(at.range.start.offset, offset);
                }
                return prefixFilter(items, valuePrefix);
            }
            else {
                // hasValue true: user may be editing the existing direction value token (partial)
                // Handle cursor inside or right after valueToken (at may be undefined when at token end)
                if (valueToken) {
                    const idx = tokens.indexOf(valueToken);
                    const prevIsDir = idx > 0 && tokens[idx - 1]?.type === "DIRECTION_KW";
                    if (prevIsDir && offset >= valueToken.range.start.offset && offset <= valueToken.range.end.offset + 1) {
                        const valuePrefix = source.slice(valueToken.range.start.offset, offset);
                        const items = DIRECTIONS.map((d) => ({
                            label: d,
                            kind: "value",
                            detail: "direction",
                        }));
                        return prefixFilter(items, valuePrefix);
                    }
                }
                // Fallback for at being IDENT (when offset inside token)
                if (at && at.type === "IDENT") {
                    // check previous token is DIRECTION_KW or this token is the value token
                    const isValueToken = valueToken && at.range.start.offset === valueToken.range.start.offset;
                    const prevIsDir = (() => {
                        const idx = tokens.indexOf(at);
                        return idx > 0 && tokens[idx - 1]?.type === "DIRECTION_KW";
                    })();
                    if (isValueToken || prevIsDir) {
                        const items = DIRECTIONS.map((d) => ({
                            label: d,
                            kind: "value",
                            detail: "direction",
                        }));
                        // Use value token prefix, not keyword prefix
                        const valuePrefix = source.slice(at.range.start.offset, offset);
                        return prefixFilter(items, valuePrefix);
                    }
                }
                if (at && at.type === "UNKNOWN" && valueToken && at.range.start.offset === valueToken.range.start.offset) {
                    const items = DIRECTIONS.map((d) => ({
                        label: d,
                        kind: "value",
                        detail: "direction",
                    }));
                    const valuePrefix = source.slice(at.range.start.offset, offset);
                    return prefixFilter(items, valuePrefix);
                }
            }
        }
        // Also if currentLinePrefix trimmed is exactly "direction" or "direction " etc, or prefix is part of "direction" keyword? handle typo? but not needed
        // Direct textual check: if trimmedBefore endsWith "direction" (keyword not yet completed + space)
        if (trimmedBefore.endsWith("direction") && !trimmedBefore.endsWith("direction ")) {
            // cursor right after keyword without space — also suggest directions after space? but we suggest directions
            // Provide directions anyway
            // Actually spec example: After "direction\n" suggest TB etc — means after keyword on next line? Wait example:
            // After:
            // direction
            // suggest TB etc -> means line is "direction" with no value, next line maybe? Or same line start?
            // Interpret as after typing "direction" and awaiting value
        }
    }
    // 2) Inside brackets [ _ ] — suggest known node types
    // Detect if previous non-whitespace char before offset is "[" or inside bracket context
    {
        // Find last LBRACKET before offset not closed before offset
        // Simple: look backward for LBRACKET, check if not followed by RBRACKET before offset
        let lastLbIdx = -1;
        let lastRbIdx = -1;
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.range.end.offset > offset)
                break;
            if (t.type === "LBRACKET")
                lastLbIdx = i;
            if (t.type === "RBRACKET")
                lastRbIdx = i;
        }
        if (lastLbIdx !== -1 && lastLbIdx > lastRbIdx) {
            // Inside brackets
            const items = KNOWN_TYPES.map((t) => ({
                label: t,
                kind: "type",
                detail: "node type",
            }));
            return prefixFilter(items, prefix);
        }
    }
    // 3) After edge operator -> or -- => suggest node ids (existing nodes)
    {
        // Find last ARROW/DASHDASH before offset that is on same line and no target yet
        let lastOpIdx = -1;
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t.range.end.offset <= offset && (t.type === "ARROW" || t.type === "DASHDASH")) {
                lastOpIdx = i;
                break;
            }
            if (t.type === "NEWLINE" && t.range.start.offset < offset) {
                // crossed line, but maybe edge is multiline? Floe is single line per statement, so break
                break;
            }
        }
        if (lastOpIdx !== -1) {
            const opTok = tokens[lastOpIdx];
            // Check if there is already a target IDENT after op before offset and before newline
            let hasTarget = false;
            for (let i = lastOpIdx + 1; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.range.start.offset >= offset)
                    break;
                if (t.type === "NEWLINE" || t.type === "COMMENT" || t.type === "RBRACE")
                    break;
                if (t.type === "IDENT") {
                    // Could be target but if prefix exists we still want to suggest? If at is IDENT (partial target) we should suggest filtered node ids
                    hasTarget = true;
                    // But if we are currently typing target (at is IDENT), we should still suggest
                    if (at && at.type === "IDENT" && at.range.start.offset > opTok.range.end.offset) {
                        hasTarget = false; // still completing target
                    }
                    break;
                }
            }
            if (!hasTarget) {
                // Suggest existing node ids + group ids
                try {
                    const { diagram } = parseFloe(source);
                    const ids = diagram.nodes.map((n) => n.id);
                    // also groups
                    const collectGroups = (gs) => {
                        const out = [];
                        for (const g of gs) {
                            out.push(g.id);
                            out.push(...collectGroups(g.groups));
                        }
                        return out;
                    };
                    const groupIds = collectGroups(diagram.groups);
                    const allIds = Array.from(new Set([...ids, ...groupIds]));
                    const items = allIds.map((id) => ({
                        label: id,
                        kind: "variable",
                        detail: "node",
                    }));
                    if (items.length === 0) {
                        // Fallback suggest placeholder?
                        return [];
                    }
                    return prefixFilter(items, prefix);
                }
                catch {
                    return [];
                }
            }
        }
    }
    // 4) At line start or after newline => suggest top-level keywords + existing ids for edge sources?
    // Check if current line prefix after trimStart is empty or is partial keyword
    {
        const lineTrim = trimmedLine;
        // If line is empty or starts with partial identifier that could be keyword
        if (lineTrim === "" || /^[A-Za-z]*$/.test(prefix) && lineTrim.length <= prefix.length + 10) {
            // Determine if we are at start of statement (beginning of line)
            // Suggest keywords
            const keywordItems = TOP_LEVEL_KEYWORDS.map((k) => ({
                label: k,
                kind: "keyword",
                detail: "keyword",
            }));
            // Also suggest existing node ids as potential edge sources? Might be useful
            // But to avoid random, we only suggest keywords at line start; user can type edge from existing node by typing its id
            // For now, suggest keywords filtered by prefix, plus maybe direction values if after direction? already handled
            // Include node types? No
            // For broader completions, include existing ids as well when prefix matches?
            // Let's include node ids when prefix is not empty and not a keyword prefix?
            // Better: if prefix empty, suggest keywords; if prefix matches keyword start, filter keywords; else also suggest node ids
            const filteredKeywords = prefixFilter(keywordItems, prefix);
            if (filteredKeywords.length > 0) {
                // Also consider suggesting node ids if requested? But keep deterministic
                // Include node ids as secondary if keyword filter yields many? Keep just keywords for top-level start
                return filteredKeywords;
            }
            // If no keyword matches, fallback to suggest node ids (useful for edge source completion at line start)
            if (prefix.length > 0) {
                try {
                    const { diagram } = parseFloe(source);
                    const ids = Array.from(new Set(diagram.nodes.map((n) => n.id)));
                    const idItems = ids.map((id) => ({
                        label: id,
                        kind: "variable",
                        detail: "node id",
                    }));
                    const filteredIds = prefixFilter(idItems, prefix);
                    if (filteredIds.length > 0)
                        return filteredIds;
                }
                catch { }
            }
            return filteredKeywords;
        }
    }
    // 5) After "group" keyword — expecting group id? Could suggest?
    {
        if (before && before.type === "GROUP_KW") {
            return []; // expecting new identifier, no suggestion
        }
        if (trimmedBefore.endsWith("group") || trimmedBefore.match(/\bgroup\s+$/)) {
            return [];
        }
    }
    // 6) After "meta", "note", "link" etc — suggest identifiers
    {
        if (before && before.type === "META_KW") {
            // meta key — suggest? no
            return [];
        }
        if (before && before.type === "NOTE_KW") {
            // note [target] — suggest existing ids
            try {
                const { diagram } = parseFloe(source);
                const ids = Array.from(new Set([...diagram.nodes.map((n) => n.id), ...collectGroupIds(diagram.groups)]));
                const items = ids.map((id) => ({
                    label: id,
                    kind: "variable",
                    detail: "note target",
                }));
                // Also suggest string? But not needed
                if (items.length > 0)
                    return prefixFilter(items, prefix);
            }
            catch { }
        }
        if (before && before.type === "LINK_KW") {
            try {
                const { diagram } = parseFloe(source);
                const ids = Array.from(new Set([...diagram.nodes.map((n) => n.id), ...collectGroupIds(diagram.groups)]));
                const items = ids.map((id) => ({
                    label: id,
                    kind: "variable",
                    detail: "link target",
                }));
                return prefixFilter(items, prefix);
            }
            catch { }
        }
    }
    return [];
}
function collectGroupIds(groups) {
    const out = [];
    for (const g of groups) {
        out.push(g.id);
        out.push(...collectGroupIds(g.groups));
    }
    return out;
}
