/**
 * collector.js
 * PURE STORAGE LAYER — with deduplication, schema validation,
 * immutability protection, and indexed access maps.
 */

// ─── Schema validators ────────────────────────────────────────────────────────
// Each validator checks the MINIMUM fields the rest of the pipeline relies on.
const SCHEMAS = {
    // UPDATED: Accept either startLine or line
    functions: (e) => typeof e.name === "string" && (typeof e.startLine === "number" || typeof e.line === "number"),
    calls:     (e) => typeof e.callee    === "string" && typeof e.startLine === "number",
    apiCalls:  (e) => typeof e.method    === "string" && typeof e.url       === "string",
    routes:    (e) => typeof e.method    === "string" && typeof e.path      === "string",
    events:    (e) => typeof e.event     === "string" && typeof e.startLine === "number",
    imports:   (e) => typeof e.source    === "string",
};

// ─── Dedup key builders ───────────────────────────────────────────────────────
// Prefer the extractor-generated `id` (strongest identity) when available,
// fall back to a composite key that matches the resolver's own identity logic.
const DEDUP_KEY = {
    // extractor stamps: id = `${filePath}::${name}::${startLine}`
    functions: (e) => e.id ?? `${e.name}:${e.startLine}`,

    // calleeFunctionId is the fully-qualified resolver ID when resolvable
    calls:     (e) => e.calleeFunctionId ?? `${e.callee}:${e.startLine}:${e.endLine}`,

    // normalizedUrl strips query strings / path params — avoids false dupes
    apiCalls:  (e) => `${e.method}:${e.normalizedUrl ?? e.url}:${e.startLine}`,

    // extractor stamps: id = `${method}::${path}`
    routes:    (e) => e.id ?? `${e.method}:${e.path}`,

    // events are file-scoped — include file to avoid cross-file collisions
    events:    (e) => `${e.event}:${e.startLine}:${e.file ?? ""}`,

    // importedAs disambiguates  `import A from 'x'`  vs  `import B from 'x'`
    imports:   (e) => `${e.source}:${e.importedAs ?? "*"}`,
};

function createCollector(filePath) {
    // Internal mutable state — never exposed directly
    const _store = {
        file:      filePath,
        functions: [],
        calls:     [],
        apiCalls:  [],
        routes:    [],
        events:    [],
        imports:   [],
        errors:    [],          // schema / dedup diagnostics
    };

    // Dedup sets per category
    const _seen = {
        functions: new Set(),
        calls:     new Set(),
        apiCalls:  new Set(),
        routes:    new Set(),
        events:    new Set(),
        imports:   new Set(),
    };

    // Fast-lookup indexes (rebuilt lazily on getData)
    let _dirty = true;
    const _index = {};

    
    function _add(category, entry) {
        // NEW: Normalize 'line' to 'startLine' before validation
        if (entry.line !== undefined && entry.startLine === undefined) {
            entry.startLine = entry.line;
        }

        // 1. Schema check
        if (!SCHEMAS[category](entry)) {
            // NEW: Added debug log to catch silent extractor failures
            console.log(`[collector] ❌ REJECTED ${category}:`, entry);
            _store.errors.push({
                category,
                entry,
                reason: "schema_validation_failed",
            });
            return;
        }

        // 2. Dedup check
        const key = DEDUP_KEY[category](entry);
        if (_seen[category].has(key)) return;
        _seen[category].add(key);

        // 3. Store (with file stamped)
        _store[category].push({ ...entry, file: filePath });
        _dirty = true;
    }
    // ── Index builder ─────────────────────────────────────────────────────────
    function _buildIndexes() {
        if (!_dirty) return;

        // functionsByName → array to support same-name functions across files
        _index.functionsByName = _store.functions.reduce((acc, f) => {
            (acc[f.name] ??= []).push(f);
            return acc;
        }, {});

        // importsBySource → array (multiple named imports from same source)
        _index.importsBySource = _store.imports.reduce((acc, i) => {
            (acc[i.source] ??= []).push(i);
            return acc;
        }, {});

        // routesByPath → method:path is unique (routes deduped at add time)
        _index.routesByPath = Object.fromEntries(
            _store.routes.map((r) => [`${r.method}:${r.path}`, r])
        );

        _dirty = false;
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        addFunction(entry) { _add("functions", entry); },
        addCall(entry)     { _add("calls",     entry); },
        addApiCall(entry)  { _add("apiCalls",  entry); },
        addRoute(entry)    { _add("routes",    entry); },
        addEvent(entry)    { _add("events",    entry); },
        addImport(entry)   { _add("imports",   entry); },

        /**
         * Returns a deep-frozen snapshot — callers cannot mutate internal state.
         */
        getData() {
            _buildIndexes();
            return Object.freeze({
                file:      _store.file,
                functions: [..._store.functions],
                calls:     [..._store.calls],
                apiCalls:  [..._store.apiCalls],
                routes:    [..._store.routes],
                events:    [..._store.events],
                imports:   [..._store.imports],
                errors:    [..._store.errors],
                _index:    { ..._index },           // pre-built lookup maps
            });
        },

        /** Quick diagnostic — how many items per category. */
        getSummary() {
            return Object.fromEntries(
                ["functions","calls","apiCalls","routes","events","imports"]
                    .map((k) => [k, _store[k].length])
            );
        },
    };
}

module.exports = { createCollector };