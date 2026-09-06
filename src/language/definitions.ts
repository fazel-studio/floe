import { tokenize } from "../lexer.js";
import { getTokenAtOffset } from "./utils.js";
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
/**
 * Definitions — a node declaration should be identifiable.
 * Given offset, find definition location of symbol at that offset.
 */
export function getDefinition(source, offset) {
    const tokens = tokenize(source);
    const tok = getTokenAtOffset(tokens, offset);
    if (!tok || tok.type !== "IDENT")
        return null;
    const id = tok.lexeme;
    const { diagram } = parseFloe(source);
    // Search explicit nodes first
    const node = diagram.nodes.find((n) => n.id === id);
    if (node) {
        return { range: node.range };
    }
    // Search groups
    const grp = findGroup(diagram.groups, id);
    if (grp) {
        return { range: grp.range };
    }
    // If not found as node/group but appears as edge source/target implicit, definition could be first occurrence?
    // Fallback: find first token with same lexeme
    for (const t of tokens) {
        if (t.type === "IDENT" && t.lexeme === id) {
            return { range: t.range };
        }
    }
    return null;
}
/** For testing: get definition for a given word directly */
export function getDefinitionForWord(source, word) {
    const { diagram } = parseFloe(source);
    const node = diagram.nodes.find((n) => n.id === word);
    if (node)
        return { range: node.range };
    const grp = findGroup(diagram.groups, word);
    if (grp)
        return { range: grp.range };
    return null;
}
function findGroup(groups, id) {
    for (const g of groups) {
        if (g.id === id)
            return g;
        const child = findGroup(g.groups, id);
        if (child)
            return child;
    }
    return undefined;
}
