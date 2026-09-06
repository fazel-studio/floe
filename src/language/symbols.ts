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
 * Symbols — discoverable symbols in document.
 * Provides hierarchical outline: groups, nodes, edges.
 */
export function getSymbols(source) {
    const { diagram } = parseFloe(source);
    const symbols = [];
    if (diagram.directionRange) {
        symbols.push({
            name: `direction ${diagram.direction}`,
            kind: "direction",
            range: diagram.directionRange,
            detail: diagram.direction,
        });
    }
    // Top-level groups hierarchical
    for (const grp of diagram.groups) {
        symbols.push(groupToSymbol(grp));
    }
    // Nodes (flattened). Provide as top-level symbols if not already contained in group's symbol children.
    // For outline, we already embed node symbols inside group symbols via children.
    // But also provide flat list for nodes not in groups.
    const groupedNodeIds = new Set();
    function collectGroupedIds(groups) {
        for (const g of groups) {
            for (const nid of g.nodeIds)
                groupedNodeIds.add(nid);
            collectGroupedIds(g.groups);
        }
    }
    collectGroupedIds(diagram.groups);
    for (const node of diagram.nodes) {
        // Skip if node is already represented inside group children (avoid duplicate)
        // We'll still add but mark as nested? For symbol provider, flat is okay.
        // Decide: only add nodes NOT in any group as top-level; grouped nodes appear inside group children.
        if (groupedNodeIds.has(node.id))
            continue;
        symbols.push({
            name: node.id,
            kind: "node",
            range: node.range,
            detail: node.type ? `[${node.type}]${node.label ? ` "${node.label}"` : ""}` : node.label ? `"${node.label}"` : undefined,
        });
    }
    // Edges as symbols
    for (const edge of diagram.edges) {
        symbols.push({
            name: `${edge.source} ${edge.kind === "directed" ? "->" : "--"} ${edge.target}`,
            kind: "edge",
            range: edge.range,
            detail: edge.label ? `: ${edge.label}` : undefined,
        });
    }
    // Metadata
    for (const [k, v] of Object.entries(diagram.metadata)) {
        // No range stored precisely, omit or use directionRange? Skip range for metadata top-level? Use dummy.
        // For now not add symbols for metadata at top level unless we have range.
        // We have no per-meta range except global, so skip symbol for metadata to keep ranges accurate.
    }
    for (const ann of diagram.annotations) {
        if (!ann.target) {
            symbols.push({
                name: `note "${ann.text.slice(0, 20)}"`,
                kind: "annotation",
                range: ann.range,
                detail: ann.text,
            });
        }
    }
    for (const link of diagram.links) {
        symbols.push({
            name: `link ${link.target}`,
            kind: "link",
            range: link.range,
            detail: link.url,
        });
    }
    return symbols;
}
function groupToSymbol(g) {
    const children = [];
    // Add nested groups
    for (const child of g.groups) {
        children.push(groupToSymbol(child));
    }
    // Add member nodes as children (need node objects; but we have only ids. We'll lookup not needed; we can create placeholder symbols)
    for (const nid of g.nodeIds) {
        // Need to find node range - but we don't have here; we could create symbol with range same as group? Better fetch from diagram? For now use group range subset.
        children.push({
            name: nid,
            kind: "node",
            range: g.range, // approximate; ideal would be node range but we don't have.
            detail: "member",
        });
    }
    if (g.metadata) {
        for (const [k, v] of Object.entries(g.metadata)) {
            children.push({
                name: `meta ${k}`,
                kind: "meta",
                range: g.range,
                detail: `"${v}"`,
            });
        }
    }
    for (const ann of g.annotations) {
        children.push({
            name: ann.target ? `note ${ann.target}` : `note`,
            kind: "annotation",
            range: ann.range,
            detail: ann.text,
        });
    }
    if (g.link) {
        children.push({
            name: `link ${g.id}`,
            kind: "link",
            range: g.range,
            detail: g.link,
        });
    }
    return {
        name: g.id,
        kind: "group",
        range: g.range,
        detail: g.type ? `[${g.type}]${g.label ? ` "${g.label}"` : ""}` : g.label ? `"${g.label}"` : undefined,
        children: children.length > 0 ? children : undefined,
    };
}
/** Provides flat list (non-hierarchical) for simpler testing */
export function getFlatSymbols(source) {
    const hierarchical = getSymbols(source);
    const flat = [];
    function walk(arr) {
        for (const s of arr) {
            flat.push(s);
            if (s.children)
                walk(s.children);
        }
    }
    walk(hierarchical);
    return flat;
}
