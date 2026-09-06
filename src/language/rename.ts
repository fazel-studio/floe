import { tokenize } from "../lexer.js";
import { getTokenAtOffset } from "./utils.js";
import { isValidIdentifier } from "../types.js";
import { getReferencesForWord } from "./references.js";
export function rename(source, offset, newName) {
    if (!isValidIdentifier(newName)) {
        return { error: `Invalid identifier '${newName}': must match [A-Za-z_][A-Za-z0-9_-]*`, code: "E002" };
    }
    const tokens = tokenize(source);
    const tok = getTokenAtOffset(tokens, offset);
    if (!tok || tok.type !== "IDENT") {
        return { error: `No identifier found at offset ${offset}` };
    }
    const oldName = tok.lexeme;
    if (oldName === newName) {
        return { edits: [] };
    }
    const refs = getReferencesForWord(source, oldName);
    const edits = refs.map((loc) => ({
        range: loc.range,
        newText: newName,
    }));
    // Sort edits descending by offset so applying sequentially doesn't shift offsets
    // But for API we return them sorted ascending? We'll sort descending for applying helper.
    // For consumption we provide stable order ascending? Provide descending for LSP style? We'll provide ascending but apply reverse.
    // Ensure deterministic
    edits.sort((a, b) => b.range.start.offset - a.range.start.offset);
    return { edits, newSource: applyEdits(source, edits) };
}
export function applyEdits(source, edits) {
    // Apply edits in descending offset order to preserve correctness
    const sorted = [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset);
    let out = source;
    for (const e of sorted) {
        const start = e.range.start.offset;
        const end = e.range.end.offset;
        out = out.slice(0, start) + e.newText + out.slice(end);
    }
    return out;
}
/** Convenience: rename word directly without offset, useful for tests */
export function renameWord(source, oldWord, newName) {
    if (!isValidIdentifier(newName)) {
        return { error: `Invalid identifier '${newName}'`, code: "E002" };
    }
    const refs = getReferencesForWord(source, oldWord);
    if (refs.length === 0)
        return { error: `No references found for '${oldWord}'` };
    const edits = refs.map((loc) => ({ range: loc.range, newText: newName }));
    edits.sort((a, b) => b.range.start.offset - a.range.start.offset);
    return { edits, newSource: applyEdits(source, edits) };
}
