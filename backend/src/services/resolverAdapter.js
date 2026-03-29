/**
 * resolverAdapter.js
 * CONNECTION LAYER — the only file allowed to read from the index directly.
 *
 * Responsibilities
 *  ✅ findFunctionById(id)          — primary, zero-ambiguity lookup
 *  ✅ findFunction(name, callerFile) — name-hint fallback with proximity scoring
 *  ✅ findRoute(url, method)         — exact + pattern + suffix, method-aware
 *  ✅ getCalls(fnId, fileData)       — outbound calls scoped to a function ID
 *  ✅ getUsedBy(fnId)                — inbound callers via lazy reverseMap
 *  ✅ getFileData(relativePath)      — raw parsed data access
 *  ✅ knowsFunction(name)            — existence check without resolution
 *
 * ReverseMap lives here (not in indexBuilder) — it is a relationship concern,
 * not a build concern. Built lazily on first getUsedBy() call.
 *
 * ❌ No traversal   ❌ No filtering   ❌ No indexing of new data
 */

const { index, makeRouteId } = require("./indexBuilder");

// ─── Lazy reverse map ─────────────────────────────────────────────────────────
// "callee-id" → Set<"caller-id">
// Built once on first use; invalidated if index.build() is called again.

let _reverseMap      = null;
let _reverseMapEpoch = -1;   // tracks index rebuild cycles

function _ensureReverseMap() {
    // Use file count as a cheap epoch — changes when build() runs
    const epoch = index.files.size;
    if (_reverseMap && _reverseMapEpoch === epoch) return;

    _reverseMap      = new Map();
    _reverseMapEpoch = epoch;

    for (const [relativePath, data] of index.files) {
        for (const call of (data.calls ?? [])) {
            if (!call.name || !call.from) continue;

            // Resolve callee to its canonical ID
            const calleeEntry = findFunction(call.name, relativePath);
            if (!calleeEntry) continue;

            // Resolve caller to its canonical ID
            const callerEntry = findFunction(call.from, relativePath);
            if (!callerEntry) continue;

            if (!_reverseMap.has(calleeEntry.id)) {
                _reverseMap.set(calleeEntry.id, new Set());
            }
            _reverseMap.get(calleeEntry.id).add(callerEntry.id);
        }
    }
}

// ─── Function resolution ──────────────────────────────────────────────────────

/**
 * Primary lookup — resolve a function by its exact ID.
 * Zero ambiguity.
 *
 * @param   {string} id - Canonical function ID ("file::name::line")
 * @returns {{ id, name, file, startLine, endLine, type }|null}
 */
function findFunctionById(id) {
    return index.functionsById.get(id) ?? null;
}

/**
 * Name-hint lookup — use when only the function name is known.
 * Applies proximity scoring (same file → same dir → first match).
 * Use findFunctionById() instead whenever a full ID is available.
 *
 * @param   {string}      name       - Function name
 * @param   {string|null} callerFile - Relative path of calling file (hint)
 * @returns {{ id, name, file, startLine, endLine, type }|null}
 */
// ─── Path-tail matcher (absolute vs relative path reconciliation) ─────────────
// imports_extractor resolvedPath is absolute; index keys are relative.
// Match on last 2 segments: "services/analyzer.service.js"
function _pathTailMatches(indexedPath, resolvedPath) {
    if (!indexedPath || !resolvedPath) return false;
    const a = indexedPath.replace(/\\/g, "/");
    const b = resolvedPath.replace(/\\/g, "/");
    if (a === b) return true;
    if (b.endsWith(a) || a.endsWith(b)) return true;
    const tailA = a.split("/").slice(-2).join("/");
    const tailB = b.split("/").slice(-2).join("/");
    return tailA === tailB && tailA.length > 0;
}

function findFunction(name, callerFile = null) {
    // 1. Exact name match in functionsByName index
    const ids = index.functionsByName.get(name);
    if (ids && ids.length > 0) {
        if (ids.length === 1) return index.functionsById.get(ids[0]) ?? null;

        const candidates = ids.map(id => index.functionsById.get(id)).filter(Boolean);

        if (callerFile) {
            // Exact same file
            const local = candidates.find(m => m.file === callerFile);
            if (local) return local;

            // Path-tail match (absolute vs relative from imports_extractor)
            const localTail = candidates.find(m => _pathTailMatches(m.file, callerFile));
            if (localTail) return localTail;

            // Same directory
            const callerDir = callerFile.split("/").slice(0, -1).join("/");
            const sameDir   = candidates.find(m => m.file.startsWith(callerDir));
            if (sameDir) return sameDir;
        }

        console.warn(
            `[resolverAdapter] ambiguous "${name}" — ${candidates.length} matches.` +
            ` Using: ${candidates[0].file} (id: ${candidates[0].id})`
        );
        return candidates[0];
    }

    // 2. Short-name fallback: "build" → finds "GlobalIndex.build"
    // calls_extractor produces bare method name; functions_extractor stores qualified.
    const dotSuffix = `.${name}`;
    const qualified = [];
    for (const [, fn] of index.functionsById) {
        if (fn.name.endsWith(dotSuffix)) qualified.push(fn);
    }

    if (qualified.length === 1) return qualified[0];

    if (qualified.length > 1 && callerFile) {
        const local = qualified.find(m => _pathTailMatches(m.file, callerFile));
        if (local) return local;
    }

    if (qualified.length > 0) return qualified[0];

    return null;
}

/**
 * Returns true if any function with this name exists in the index.
 * Use this for existence checks in filters — avoids full resolution cost.
 *
 * @param   {string} name
 * @returns {boolean}
 */
function knowsFunction(name) {
    // Direct name match
    const ids = index.functionsByName.get(name);
    if (ids && ids.length > 0) return true;

    // Qualified class method: "build" → "GlobalIndex.build" exists
    const dotSuffix = `.${name}`;
    for (const [, fn] of index.functionsById) {
        if (fn.name.endsWith(dotSuffix)) return true;
    }
    return false;
}

// ─── Route resolution ─────────────────────────────────────────────────────────

/**
 * Find a route matching the given URL and optional HTTP method.
 * Tries: exact method+path → any-method exact → param pattern → suffix fallback.
 *
 * @param   {string}      url
 * @param   {string|null} [method=null] - HTTP method hint (improves precision)
 * @returns {{ id, handler, file, method, path }|null}
 */
function findRoute(url, method = null) {
    if (!url || url.startsWith("dynamic:")) return null;

    let cleanUrl = url;
    try {
        if (url.startsWith("http")) cleanUrl = new URL(url).pathname;
    } catch (_) {}

    // 1. Exact match with method hint
    if (method) {
        const exact = index.routes.get(makeRouteId(method, cleanUrl));
        if (exact) return exact;
    }

    // 2. Exact path, any method
    for (const [, data] of index.routes) {
        if (data.path === cleanUrl) return data;
    }

    // 3. Express-style param pattern  (/users/:id  →  /users/42)
    for (const [, data] of index.routes) {
        if (method && data.method !== method.toUpperCase() && data.method !== "ANY") continue;
        const pattern = new RegExp(
            "^" + data.path.replace(/:[^\s/]+/g, "([^/]+)") + "$"
        );
        if (pattern.test(cleanUrl)) return data;
    }

    // 4. Suffix fallback  (/api/users  →  /users)
    const parts = cleanUrl.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        const trial = "/" + parts.slice(i).join("/");
        for (const [, data] of index.routes) {
            if (data.path === trial) return data;
        }
    }

    return null;
}

// ─── File data ────────────────────────────────────────────────────────────────

/**
 * Return the full parsed data for a relative file path.
 *
 * @param   {string} relativePath
 * @returns {object|undefined}
 */
function getFileData(relativePath) {
    return index.files.get(relativePath);
}

// ─── Outbound calls ───────────────────────────────────────────────────────────

/**
 * Return all calls made from the function identified by `fnInfo` in fileData.
 * Matches on function name (extractor stamps `from` as name, not full ID).
 *
 * @param   {object} fnInfo   - Function definition ({ name, ... })
 * @param   {object} fileData - Parsed file data from getFileData()
 * @returns {object[]}
 */
function getCalls(fnInfo, fileData) {
    if (!fileData?.calls) return [];
    return fileData.calls.filter(c => c.from === fnInfo.name);
}

// ─── Inbound callers ──────────────────────────────────────────────────────────

/**
 * Return all known callers of the function with the given ID.
 * Builds (and caches) the reverse map on first call.
 *
 * @param   {string} fnId - Canonical function ID
 * @returns {{ id, name, file, startLine, endLine, type }[]}
 */
function getUsedBy(fnId) {
    _ensureReverseMap();
    const callerIds = _reverseMap.get(fnId) ?? new Set();

    return Array.from(callerIds)
        .map(id => index.functionsById.get(id))
        .filter(Boolean);
}

// ─── Route → handler lookup ───────────────────────────────────────────────────

/**
 * Return all routes that declare `handlerName` as their handler.
 * Used by graphTraversal to annotate functions with their HTTP entry points.
 *
 * @param   {string} handlerName
 * @returns {{ id, handler, file, method, path }[]}
 */
function getRoutesForHandler(handlerName) {
    const results = [];
    for (const [, data] of index.routes) {
        if (data.handler === handlerName) results.push(data);
    }
    return results;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    findFunctionById,
    findFunction,
    knowsFunction,
    findRoute,
    getFileData,
    getCalls,
    getUsedBy,
    getRoutesForHandler,
};