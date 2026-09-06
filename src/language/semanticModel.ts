import { tokenize } from "../lexer.js";
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
export function buildSemanticModel(source) {
    const { diagram, diagnostics } = parseFloe(source);
    const tokens = tokenize(source);
    return { source, diagram, diagnostics, tokens };
}
export function getSemanticModel(source) {
    return buildSemanticModel(source);
}
/** Utility: find node by id in semantic model */
export function findNode(model, id) {
    return model.diagram.nodes.find((n) => n.id === id);
}
export function findGroup(model, id) {
    function search(groups) {
        for (const g of groups) {
            if (g.id === id)
                return g;
            const found = search(g.groups);
            if (found)
                return found;
        }
        return undefined;
    }
    return search(model.diagram.groups);
}
