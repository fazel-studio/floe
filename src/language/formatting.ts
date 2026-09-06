/**
 * Formatter — create canonical formatting, deterministic.
 * Input:
 *   A->B
 *   B -> C: hello
 * Output:
 *   A -> B
 *   B -> C : hello
 *
 * Must be deterministic and preserve semantics.
 * Operates on Floe language model — line-oriented formatting with group indentation.
 */
const INDENT = "  ";
export function format(source: string, opts?: import("./types.js").FormattingOptions) {
    const indentStr = opts?.indentString ?? INDENT;
    const lines = source.split(/\r?\n/);
    const outLines = [];
    let indentLevel = 0;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? "";
        const trimmed = raw.trim();
        // Handle blank lines - preserve but normalize to empty, collapse handled later
        if (trimmed === "") {
            outLines.push("");
            continue;
        }
        // Extract comment part respecting strings
        const { codePart, commentPart } = splitComment(trimmed);
        // If whole line is comment
        if (codePart === "" && commentPart !== "") {
            outLines.push(indentStr.repeat(indentLevel) + normalizeComment(commentPart));
            continue;
        }
        // Detect closing brace line before indent calculation
        const isClosingBrace = codePart.trim() === "}";
        if (isClosingBrace) {
            indentLevel = Math.max(0, indentLevel - 1);
            const formatted = formatCodePart(codePart, commentPart, indentLevel, indentStr);
            outLines.push(formatted);
            continue;
        }
        // Normal line
        const formatted = formatCodePart(codePart, commentPart, indentLevel, indentStr);
        outLines.push(formatted);
        // After formatting, check if line opens a group brace to increase indent for next lines
        // Need to detect if codePart contains "group ... {"
        if (isGroupOpening(codePart)) {
            indentLevel++;
        }
    }
    // Post-process: collapse multiple consecutive blank lines to at most one, trim trailing blanks, ensure final newline
    const collapsed = [];
    let prevBlank = false;
    for (const l of outLines) {
        const isBlank = l === "";
        if (isBlank && prevBlank)
            continue;
        collapsed.push(l);
        prevBlank = isBlank;
    }
    // Remove leading blank lines
    while (collapsed.length > 0 && collapsed[0] === "")
        collapsed.shift();
    // Remove trailing blank lines before ensuring final newline
    while (collapsed.length > 0 && collapsed[collapsed.length - 1] === "")
        collapsed.pop();
    let result = collapsed.join("\n");
    if (result.length === 0)
        return opts?.insertFinalNewline === false ? "" : "";
    if (opts?.insertFinalNewline !== false) {
        if (!result.endsWith("\n"))
            result += "\n";
    }
    return result;
}
function normalizeComment(c) {
    const trim = c.trim();
    if (trim.startsWith("//")) {
        const content = trim.slice(2).trimStart();
        if (content === "")
            return "//";
        return `// ${content}`;
    }
    return trim;
}
function splitComment(line) {
    let inString = false;
    let escaped = false;
    for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];
        const nxt = line[i + 1];
        if (!inString && ch === '"' && !escaped) {
            inString = true;
            escaped = false;
            continue;
        }
        if (inString) {
            if (ch === "\\" && !escaped) {
                escaped = true;
                continue;
            }
            if (ch === '"' && !escaped) {
                inString = false;
            }
            escaped = false;
            continue;
        }
        if (!inString && ch === "/" && nxt === "/") {
            const code = line.slice(0, i).trimEnd();
            const comment = line.slice(i).trim();
            return { codePart: code, commentPart: comment };
        }
    }
    return { codePart: line.trimEnd(), commentPart: "" };
}
function isGroupOpening(code) {
    // Check if code ends with { and starts with group keyword
    const t = code.trim();
    return /^\s*group\b.*\{\s*$/.test(t);
}
function formatCodePart(codePart, commentPart, indentLevel, indentStr) {
    const indent = indentStr.repeat(indentLevel);
    let formattedCode = formatStatement(codePart.trim());
    if (commentPart) {
        const normComment = normalizeComment(commentPart);
        if (formattedCode === "") {
            formattedCode = normComment;
        }
        else {
            formattedCode = `${formattedCode} ${normComment}`;
        }
    }
    return indent + formattedCode;
}
function formatStatement(code) {
    if (code === "")
        return "";
    if (code === "}")
        return "}";
    // Try in order: direction, group, meta, note, link, edge, node
    // Direction: direction LR
    let m = code.match(/^direction\s+(\S+)\s*$/);
    if (m) {
        return `direction ${m[1]}`;
    }
    // If direction without value but with incomplete? e.g., "direction"
    if (/^direction\s*$/.test(code)) {
        return "direction";
    }
    // Group header: group ID [type] "label" {
    // Pattern: group <id> ([<type>])? ("<label>")? {
    m = code.match(/^group\s+([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\])?\s*(?:"((?:[^"\\]|\\.)*)")?\s*\{\s*$/);
    if (m) {
        const id = m[1];
        const type = m[2];
        const label = m[3];
        let out = `group ${id}`;
        if (type)
            out += ` [${type}]`;
        if (label !== undefined)
            out += ` "${escapeString(unescapeString(label))}"`;
        out += " {";
        return out;
    }
    // Group one-liner with closing brace on same line? "group X { }"
    m = code.match(/^group\s+([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\])?\s*(?:"((?:[^"\\]|\\.)*)")?\s*\{\s*\}\s*$/);
    if (m) {
        const id = m[1];
        const type = m[2];
        const label = m[3];
        let out = `group ${id}`;
        if (type)
            out += ` [${type}]`;
        if (label !== undefined)
            out += ` "${escapeString(unescapeString(label))}"`;
        out += " {";
        // For one-liner we could keep as two lines? But deterministic we output header line plus closing? Simplify to header + " }" handled as two tokens? We'll output as "group X { }"
        // For now normalize to "group X { }" but single line format? Better keep as "group X {"
        // We'll format as "group X {" and expect closing brace separately. But input has both on same line, we normalize to "group X { }"
        return out + " }";
    }
    // Meta: meta key = "value"
    m = code.match(/^meta\s+([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) {
        const key = m[1];
        const val = m[2] ?? "";
        return `meta ${key} = "${escapeString(unescapeString(val))}"`;
    }
    // Note: note [target] "text"
    m = code.match(/^note\s+(?:([A-Za-z_][A-Za-z0-9_-]*)\s+)?"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) {
        const target = m[1];
        const text = m[2] ?? "";
        if (target)
            return `note ${target} "${escapeString(unescapeString(text))}"`;
        return `note "${escapeString(unescapeString(text))}"`;
    }
    // Link: link target "url"
    m = code.match(/^link\s+([A-Za-z_][A-Za-z0-9_-]*)\s+"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) {
        const target = m[1];
        const url = m[2] ?? "";
        return `link ${target} "${escapeString(unescapeString(url))}"`;
    }
    // Edge: IDENT (->|--) IDENT (: label)?
    // Use regex that captures source, op, target, labelPart (including quotes or raw)
    // First try to match edge with label
    m = code.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(->|--)\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+?)\s*$/);
    if (m) {
        const src = m[1];
        const op = m[2];
        const tgt = m[3];
        const labelRaw = m[4].trim();
        // If label is quoted string, normalize escaping
        if (labelRaw.startsWith('"') && labelRaw.endsWith('"') && labelRaw.length >= 2) {
            const inner = labelRaw.slice(1, -1);
            // Unescape then re-escape? Keep as is but ensure quoted
            return `${src} ${op} ${tgt} : "${escapeString(unescapeString(inner))}"`;
        }
        return `${src} ${op} ${tgt} : ${labelRaw}`;
    }
    // Edge without label
    m = code.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(->|--)\s*([A-Za-z_][A-Za-z0-9_-]*)\s*$/);
    if (m) {
        const src = m[1];
        const op = m[2];
        const tgt = m[3];
        return `${src} ${op} ${tgt}`;
    }
    // Edge with colon but empty label? Keep as is but normalized spacing: "A -> B :"
    m = code.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(->|--)\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*$/);
    if (m) {
        const src = m[1];
        const op = m[2];
        const tgt = m[3];
        return `${src} ${op} ${tgt} :`;
    }
    // Node: IDENT [type] "label"
    m = code.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\])?\s*(?:"((?:[^"\\]|\\.)*)")?\s*$/);
    if (m) {
        const id = m[1];
        const type = m[2];
        const label = m[3];
        let out = id;
        if (type)
            out += ` [${type}]`;
        if (label !== undefined)
            out += ` "${escapeString(unescapeString(label))}"`;
        return out;
    }
    // Fallback: normalize whitespace for unknown statement but keep trimmed
    // For invalid lines like "User ->" or "A--B" etc, still try to canonicalize spaces around ->/--
    // Use simple replacement: ensure spaces around -> and -- and colon and brackets
    let fallback = code.trim();
    // Normalize arrow spacing: replace any surrounding spaces around -> or -- to single spaces
    fallback = fallback.replace(/\s*(->|--)\s*/g, " $1 ");
    fallback = fallback.replace(/\s*:\s*/g, " : ");
    fallback = fallback.replace(/\s*\[\s*/g, " [");
    fallback = fallback.replace(/\s*\]\s*/g, "]");
    fallback = fallback.replace(/\s*=\s*/g, " = ");
    fallback = fallback.replace(/\s+/g, " ").trim();
    return fallback;
}
function escapeString(s) {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}
function unescapeString(s) {
    return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}
/** Check if formatted output is idempotent — formatting twice yields same result */
export function isFormatted(source) {
    return format(source) === source;
}
