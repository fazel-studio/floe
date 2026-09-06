/**
 * URL sanitization for Floe links — prevents execution vectors.
 * Only allow safe schemes; block javascript:, data:, vbscript:
 */
export function sanitizeUrl(url) {
    const s = url.trim();
    if (!s)
        return null;
    if (/^(javascript|data|vbscript):/i.test(s))
        return null;
    // allow http/https, mailto, relative paths, or simple identifiers without scheme
    if (/^https?:\/\//i.test(s))
        return s;
    if (/^mailto:/i.test(s))
        return s;
    if (s.startsWith("/") && !s.startsWith("//"))
        return s;
    // relative or simple: allow if no colon (no scheme) or known safe
    if (!s.includes(":"))
        return s;
    // unknown scheme -> block
    return null;
}
export function isSafeUrl(url) {
    return sanitizeUrl(url) !== null;
}
