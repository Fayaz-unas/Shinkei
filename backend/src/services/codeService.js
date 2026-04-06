const fs   = require("fs");
const path = require("path");

const { index } = require("./indexBuilder");

/**
 * codeService.js
 *
 * Responsibility: Attach raw source code to graph nodes.
 *
 * Design:
 *  - File reads are cached in-memory (fileCache) — one read per file per build cycle.
 *  - Cache is keyed on absolute path and is invalidated when clearCache() is called
 *    (indexBuilder calls this after a fresh build via the hook below).
 *  - extractCode() is the core primitive: resolves absolute path, slices lines.
 *  - attachCodeToNodes() is the public API: enriches a nodes array in-place
 *    (or returns a new array — non-destructive via spread).
 *
 *  ❌ No traversal   ❌ No resolution   ❌ No filtering
 */

// ─── File cache ───────────────────────────────────────────────────────────────
// absolutePath → string[]  (lines, 0-indexed)
const fileCache = new Map();

function _readLines(absolutePath) {
    if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
    if (!fs.existsSync(absolutePath)) return null;
    const lines = fs.readFileSync(absolutePath, "utf-8").split("\n");
    fileCache.set(absolutePath, lines);
    return lines;
}

/** Call after indexBuilder.build() to avoid stale content on repo switch */
function clearCache() {
    fileCache.clear();
}

// ─── Core snippet extractor ───────────────────────────────────────────────────

/**
 * Extract source lines for a function given its location info.
 *
 * @param {string}      relativeFilePath  - Relative path as stored in index nodes
 * @param {number|null} startLine         - 1-based inclusive
 * @param {number|null} endLine           - 1-based inclusive (null → EOF)
 * @returns {string|null}                 - Source code string, or null if unavailable
 */
function extractCode(relativeFilePath, startLine, endLine) {
    if (!relativeFilePath || !startLine) return null;
    if (!index.repoPath) return null;

    const absolutePath = path.join(index.repoPath, relativeFilePath);
    const lines        = _readLines(absolutePath);
    if (!lines) return null;

    // startLine is 1-based → array index is startLine - 1
    const startIdx = startLine - 1;
    // slice end is exclusive, so endLine (1-based, inclusive) maps directly
    const endIdx   = endLine ? endLine : lines.length;

    if (startIdx < 0 || startIdx >= lines.length) return null;

    return lines.slice(startIdx, endIdx).join("\n");
}

// ─── Batch node enrichment ────────────────────────────────────────────────────

/**
 * Attach `code` to every node in a graph nodes array.
 * Skips nodes without a file/startLine (api, route, event stubs).
 * Non-destructive — returns new node objects via spread.
 *
 * @param   {object[]} nodes  - Graph nodes from graphTraversal
 * @returns {object[]}        - Same nodes with `code` field added
 */
function attachCodeToNodes(nodes) {
    return nodes.map(node => {
        // Only function nodes have extractable source
        if (!node.file || !node.startLine) {
            return { ...node, code: null };
        }

        const code = extractCode(node.file, node.startLine, node.endLine);
        return { ...node, code: code ?? null };
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { extractCode, attachCodeToNodes, clearCache };