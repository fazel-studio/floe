import { tokenize } from "../lexer.js";
import { getTokenAtOffset } from "./utils.js";
/**
 * References — discoverable references for a symbol at offset.
 * Includes declarations, edge sources/targets, annotation/link targets, etc.
 * Strategy: find identifier at offset, then collect all token ranges where lexeme equals that id,
 * using lexer to avoid changing unrelated text (e.g., not inside strings/comments).
 */
export function getReferences(source, offset) {
    const tokens = tokenize(source);
    const tok = getTokenAtOffset(tokens, offset);
    if (!tok || tok.type !== "IDENT")
        return [];
    const id = tok.lexeme;
    return getReferencesForWord(source, id);
}
export function getReferencesForWord(source, word) {
    const tokens = tokenize(source);
    const refs = [];
    for (const t of tokens) {
        if (t.type === "IDENT" && t.lexeme === word) {
            refs.push({ range: t.range });
        }
    }
    // Deterministic order by offset
    refs.sort((a, b) => a.range.start.offset - b.range.start.offset);
    return refs;
}
/** For richer context, also include edges as locations (already covered by token scanning) */
export function getSemanticReferences(source, offset) {
    const base = getReferences(source, offset);
    // Could also add edge ranges etc., but token scanning already covers.
    return base;
}
