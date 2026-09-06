/**
 * LSP utilities — convert between Floe ranges (1-indexed line/column, offset) and LSP positions (0-indexed).
 * Reuses language services (no editor-specific semantics).
 */
/**
 * Convert offset (0-indexed UTF-16) to LSP position (0-indexed line/char).
 * Must be deterministic and handle \r\n correctly.
 */
export function offsetToLspPosition(source, offset) {
    let line = 0;
    let character = 0;
    let cur = 0;
    const len = source.length;
    const off = Math.max(0, Math.min(offset, len));
    while (cur < off) {
        const ch = source[cur];
        if (ch === "\n") {
            line++;
            character = 0;
            cur++;
        }
        else if (ch === "\r") {
            if (source[cur + 1] === "\n") {
                line++;
                character = 0;
                cur += 2;
            }
            else {
                line++;
                character = 0;
                cur++;
            }
        }
        else {
            character++;
            cur++;
        }
    }
    return { line, character };
}
/**
 * Convert LSP position to offset.
 */
export function lspPositionToOffset(source, pos) {
    let line = 0;
    let character = 0;
    let offset = 0;
    const targetLine = pos.line;
    const targetChar = pos.character;
    // First navigate to target line
    while (offset < source.length && line < targetLine) {
        const ch = source[offset];
        if (ch === "\n") {
            line++;
            offset++;
        }
        else if (ch === "\r") {
            if (source[offset + 1] === "\n") {
                line++;
                offset += 2;
            }
            else {
                line++;
                offset++;
            }
        }
        else {
            offset++;
        }
    }
    // Now at start of target line, advance by character
    let curChar = 0;
    while (offset < source.length && curChar < targetChar) {
        const ch = source[offset];
        if (ch === "\n" || ch === "\r")
            break; // end of line
        offset++;
        curChar++;
    }
    return offset;
}
export function floeRangeToLspRange(source, floeRange) {
    // Floe is 1-indexed, LSP 0-indexed; but we can compute via offset for accuracy
    const start = offsetToLspPosition(source, floeRange.start.offset);
    const end = offsetToLspPosition(source, floeRange.end.offset);
    return { start, end };
}
export function lspRangeToOffsetRange(source, range) {
    return {
        start: lspPositionToOffset(source, range.start),
        end: lspPositionToOffset(source, range.end),
    };
}
/**
 * Convert Floe diagnostic severity to LSP DiagnosticSeverity (1=Error,2=Warning,3=Info,4=Hint)
 */
export function severityToLsp(sev) {
    switch (sev) {
        case "error": return 1;
        case "warning": return 2;
        case "info": return 3;
        default: return 1;
    }
}
/**
 * Simple URI to path helper; handles file:// URIs.
 */
export function uriToPath(uri) {
    if (uri.startsWith("file://")) {
        try {
            const url = new URL(uri);
            // On Windows, url.pathname is /C:/path; decode and handle
            let p = decodeURIComponent(url.pathname);
            // Windows: remove leading slash before drive letter
            if (process.platform === "win32" && p.match(/^\/[A-Za-z]:/)) {
                p = p.slice(1);
            }
            return p;
        }
        catch {
            return uri.slice("file://".length);
        }
    }
    return uri;
}
export function pathToUri(filePath) {
    // Normalize to file://
    let p = filePath;
    if (process.platform === "win32") {
        // Ensure forward slashes and leading slash
        p = p.replace(/\\/g, "/");
        if (!p.startsWith("/"))
            p = "/" + p;
    }
    else {
        if (!p.startsWith("/"))
            p = "/" + p;
    }
    // Encode spaces etc? Simple
    return "file://" + p;
}
