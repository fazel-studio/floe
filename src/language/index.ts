/**
 * Floe Language Services (editor-independent)
 *
 * Architecture:
 *   Floe Source -> Parser -> Semantic Model -> Language Services
 *                                ├── Completion
 *                                ├── Diagnostics
 *                                ├── Hover
 *                                ├── Definitions
 *                                ├── References
 *                                ├── Rename
 *                                └── Formatting
 *
 * This module does not depend on React, CodeMirror, or VS Code.
 */
export * from "./types.js";
export { getHighlightTokens, getHighlightingInfo } from "./highlighting.js";
export { getCompletions } from "./completion.js";
export { getDiagnostics, getDiagnosticsWithSource, lint } from "./diagnosticsService.js";
export { getHover } from "./hover.js";
export { getSymbols, getFlatSymbols } from "./symbols.js";
export { getDefinition, getDefinitionForWord } from "./definitions.js";
export { getReferences, getReferencesForWord } from "./references.js";
export { rename, renameWord, applyEdits } from "./rename.js";
export { format, isFormatted } from "./formatting.js";
export { getIndentForLine, getIndentationInfo, getIndentationColumn, DEFAULT_INDENT } from "./indentation.js";
export { getFoldingRanges, getFoldingInfo } from "./folding.js";
export { buildSemanticModel, getSemanticModel } from "./semanticModel.js";
import { getCompletions } from "./completion.js";
import { getDiagnostics } from "./diagnosticsService.js";
import { getHover } from "./hover.js";
import { getSymbols } from "./symbols.js";
import { getDefinition } from "./definitions.js";
import { getReferences } from "./references.js";
import { rename } from "./rename.js";
import { format } from "./formatting.js";
import { getHighlightTokens } from "./highlighting.js";
import { getFoldingRanges } from "./folding.js";
import { getIndentForLine } from "./indentation.js";
import { buildSemanticModel } from "./semanticModel.js";
/**
 * Unified language service — convenience wrapper for editor integrations.
 * All methods operate on Floe semantic model.
 */
export class FloeLanguageService {
    getSemanticModel(source) {
        return buildSemanticModel(source);
    }
    getDiagnostics(source) {
        return getDiagnostics(source);
    }
    getCompletions(source, offset) {
        return getCompletions(source, offset);
    }
    getHover(source, offset) {
        return getHover(source, offset);
    }
    getSymbols(source) {
        return getSymbols(source);
    }
    getDefinition(source, offset) {
        return getDefinition(source, offset);
    }
    getReferences(source, offset) {
        return getReferences(source, offset);
    }
    rename(source, offset, newName) {
        return rename(source, offset, newName);
    }
    format(source) {
        return format(source);
    }
    getHighlightTokens(source) {
        return getHighlightTokens(source);
    }
    getFoldingRanges(source) {
        return getFoldingRanges(source);
    }
    getIndentForLine(source, line) {
        return getIndentForLine(source, line);
    }
}
/** Singleton convenience */
export const floeLanguageService = new FloeLanguageService();
