/**
 * Document manager for LSP — stores open documents, tracks versions.
 * No editor-specific semantics; reuse Floe language services for content.
 */
export class DocumentManager {
    docs = new Map();
    open(uri, languageId, version, text) {
        this.docs.set(uri, { uri, languageId, version, text });
    }
    update(uri, version, text) {
        const existing = this.docs.get(uri);
        if (existing) {
            existing.version = version;
            existing.text = text;
        }
        else {
            // For didChange without open (some clients), create
            this.docs.set(uri, { uri, languageId: "floe", version, text });
        }
    }
    applyIncremental(uri, version, changes) {
        const doc = this.docs.get(uri);
        if (!doc) {
            // Create if not exists
            const text = changes.length > 0 ? changes[changes.length - 1].text : "";
            this.docs.set(uri, { uri, languageId: "floe", version, text });
            return;
        }
        // LSP incremental changes: apply in order
        // Each change has range (LSP) and text. If no range, it's full replace.
        // We need to convert LSP range to offsets using current doc text progressively?
        // Simplify: implement full-replace only if no range; otherwise incremental.
        // Need helper to convert LSP range to offset for current text.
        // We'll import utils dynamically to avoid circular? Instead implement inline.
        let newText = doc.text;
        for (const change of changes) {
            if (!change.range) {
                newText = change.text;
            }
            else {
                // Convert LSP range to offsets based on newText before this change
                // We need to compute offsets from Lsp positions; to do that we need to track.
                // Use helper function similar to lspPositionToOffset but inline here.
                const startOffset = lspPosToOffset(newText, change.range.start);
                const endOffset = lspPosToOffset(newText, change.range.end);
                newText = newText.slice(0, startOffset) + change.text + newText.slice(endOffset);
            }
        }
        doc.text = newText;
        doc.version = version;
    }
    get(uri) {
        return this.docs.get(uri);
    }
    close(uri) {
        this.docs.delete(uri);
    }
    allUris() {
        return Array.from(this.docs.keys());
    }
    has(uri) {
        return this.docs.has(uri);
    }
}
function lspPosToOffset(source, pos) {
    let line = 0;
    let offset = 0;
    while (offset < source.length && line < pos.line) {
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
        else
            offset++;
    }
    let curChar = 0;
    while (offset < source.length && curChar < pos.character) {
        const ch = source[offset];
        if (ch === "\n" || ch === "\r")
            break;
        offset++;
        curChar++;
    }
    return offset;
}
