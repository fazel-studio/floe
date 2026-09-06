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
 * Diagnostics API — useful while document is incomplete.
 * Should produce recoverable diagnostic rather than crashing.
 * Example: "User ->" should produce E009/E006 not throw.
 */
export function getDiagnostics(source) {
    const { diagnostics } = parseFloe(source);
    return diagnostics;
}
export function getDiagnosticsWithSource(source) {
    const diagnostics = getDiagnostics(source);
    return {
        diagnostics,
        hasErrors: diagnostics.some((d) => d.severity === "error"),
    };
}
/** For LSP/CodeMirror lint integration — returns diagnostics sorted */
export function lint(source) {
    return getDiagnostics(source).sort((a, b) => a.range.start.offset - b.range.start.offset);
}
