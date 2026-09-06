import { tokenize } from "../lexer.js";
/**
 * Indentation — provide indentation helpers for editors.
 * Floe indentation is brace-driven: inside `group { ... }` indent.
 */
export const DEFAULT_INDENT = "  ";
export function getIndentForLine(source, lineNumber, indentStr = DEFAULT_INDENT) {
    // Compute indent for given lineNumber (1-indexed) based on balance of braces before that line.
    // Closing brace lines should be dedented.
    const lines = source.split(/\r?\n/);
    let indentLevel = 0;
    for (let i = 1; i < lineNumber; i++) {
        const line = lines[i - 1] ?? "";
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("//"))
            continue;
        // Strip comments
        const code = stripComment(trimmed);
        // Count opening and closing braces on line
        // For simplicity, if line is group header with {, increment after
        if (/^\s*group\b.*\{\s*$/.test(code) || code.includes("{")) {
            // Count { and }
            const opens = (code.match(/\{/g) || []).length;
            const closes = (code.match(/\}/g) || []).length;
            indentLevel += opens - closes;
            if (indentLevel < 0)
                indentLevel = 0;
        }
        else if (code.trim() === "}") {
            indentLevel = Math.max(0, indentLevel - 1);
        }
        else {
            // Also handle lines that contain } not at start?
            const opens = (code.match(/\{/g) || []).length;
            const closes = (code.match(/\}/g) || []).length;
            if (closes > opens) {
                // dedent before next line handled via closes? But we already adjust for } lines separately.
                // For generic, adjust indentLevel by net
                indentLevel += opens - closes;
                if (indentLevel < 0)
                    indentLevel = 0;
            }
            else {
                indentLevel += opens - closes;
            }
        }
    }
    // If current line is closing brace, dedent
    const curLine = lines[lineNumber - 1] ?? "";
    const curTrim = curLine.trim();
    const curCode = stripComment(curTrim);
    if (curCode.startsWith("}") || curCode === "}") {
        indentLevel = Math.max(0, indentLevel - 1);
    }
    return indentStr.repeat(indentLevel);
}
export function getIndentationInfo(source, indentStr = DEFAULT_INDENT) {
    const lines = source.split(/\r?\n/);
    return lines.map((_, idx) => getIndentForLine(source, idx + 1, indentStr));
}
/** For CodeMirror indentation: function that returns column count */
export function getIndentationColumn(source, lineNumber, indentStr = DEFAULT_INDENT) {
    return getIndentForLine(source, lineNumber, indentStr).length;
}
function stripComment(line) {
    // naive strip // outside string
    let inString = false;
    let escaped = false;
    for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];
        if (!inString && ch === '"' && !escaped) {
            inString = true;
        }
        else if (inString) {
            if (ch === "\\" && !escaped)
                escaped = true;
            else if (ch === '"' && !escaped)
                inString = false;
            else
                escaped = false;
            continue;
        }
        if (!inString && ch === "/" && line[i + 1] === "/") {
            return line.slice(0, i).trim();
        }
    }
    return line.trim();
}
/** Suggest indent edits for entire document formatting (similar to formatting) */
export function getIndentationEdits(source, indentStr = DEFAULT_INDENT) {
    const lines = source.split(/\r?\n/);
    return lines.map((_, idx) => ({
        line: idx + 1,
        indent: getIndentForLine(source, idx + 1, indentStr),
    }));
}
