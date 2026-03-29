/**
 * resolver.js  — GLOBAL FLOW ENGINE
 *
 * Builds a fully linked graph from all extractor outputs.
 *
 * Links:
 *  ✅ calls       → functions     (calleeFunctionId → function.id)
 *  ✅ apiCalls    → routes        (routeMatchKey fuzzy match)
 *  ✅ events      → functions     (handlerFunctionId → function.id)
 *  ✅ imports     → files         (resolvedPath → file's function/export map)
 *  ✅ routes      → functions     (handlerFunctionId → function.id)
 *  ✅ Cross-file  function resolution via import chain
 *
 * Input:  Map<filePath, { functions, calls, events, imports, apiCalls, routes }>
 * Output: { graph, unresolvedCalls, unresolvedRoutes, stats }
 *
 * Graph node types:
 *   "function"  — a function definition
 *   "route"     — a backend route
 *   "event"     — a UI event entry point
 *   "apiCall"   — an outbound HTTP call
 *
 * Graph edge types:
 *   "calls"     — function A calls function B
 *   "handles"   — route/event is handled by function
 *   "requests"  — apiCall targets a route
 *   "imports"   — file A imports from file B
 */

class FlowGraph {
    constructor() {
        this.nodes = new Map(); // id → node
        this.edges = [];        // { from, to, type, meta }
    }

    addNode(id, type, data) {
        if (!this.nodes.has(id)) this.nodes.set(id, { id, type, ...data });
        return this;
    }

    addEdge(from, to, type, meta = {}) {
        if (!from || !to) return this;
        this.edges.push({ from, to, type, ...meta });
        return this;
    }

    // Returns all edges of a given type
    edgesOf(type) {
        return this.edges.filter(e => e.type === type);
    }

    // Returns all outgoing edges from a node
    outgoing(nodeId) {
        return this.edges.filter(e => e.from === nodeId);
    }

    // Returns all incoming edges to a node
    incoming(nodeId) {
        return this.edges.filter(e => e.to === nodeId);
    }

    // Returns full execution path from an event/route entry point to leaf functions
    traceFrom(startId, maxDepth = 20) {
        const visited = new Set();
        const paths   = [];

        const dfs = (nodeId, path, depth) => {
            if (depth > maxDepth || visited.has(nodeId)) return;
            visited.add(nodeId);
            const outs = this.outgoing(nodeId).filter(e => e.type === "calls" || e.type === "handles");
            if (outs.length === 0) {
                paths.push([...path, nodeId]);
                return;
            }
            for (const edge of outs) dfs(edge.to, [...path, nodeId], depth + 1);
        };

        dfs(startId, [], 0);
        return paths;
    }

    toJSON() {
        return {
            nodes: [...this.nodes.values()],
            edges: this.edges,
        };
    }
}

// ─── build function lookup maps ───────────────────────────────────────────────
function buildFunctionMaps(allFiles) {
    // id → function node
    const byId = new Map();
    // filePath → name → function node (for name-based resolution)
    const byFileAndName = new Map();
    // filePath → [function]
    const byFile = new Map();

    for (const [filePath, data] of allFiles) {
        const fns = data.functions ?? [];
        byFile.set(filePath, fns);

        if (!byFileAndName.has(filePath)) byFileAndName.set(filePath, new Map());
        const nameMap = byFileAndName.get(filePath);

        for (const fn of fns) {
            byId.set(fn.id, fn);
            // Store by simple name AND qualified name
            nameMap.set(fn.name, fn);
            // Also store unqualified class method name: AuthService.login → login
            if (fn.name.includes(".")) {
                const shortName = fn.name.split(".").pop();
                if (!nameMap.has(shortName)) nameMap.set(shortName, fn);
            }
        }
    }

    return { byId, byFileAndName, byFile };
}

// ─── resolve a callee function ID to an actual function node ──────────────────
function resolveFunction(calleeFunctionId, functionMaps) {
    if (!calleeFunctionId) return null;

    // 1. Direct ID match (most common — exact filePath::name::line)
    if (functionMaps.byId.has(calleeFunctionId)) return functionMaps.byId.get(calleeFunctionId);

    // 2. filePath::name form — try name-based lookup in that file
    const sepIdx = calleeFunctionId.lastIndexOf("::");
    if (sepIdx === -1) return null;

    const filePath = calleeFunctionId.slice(0, sepIdx);
    const name     = calleeFunctionId.slice(sepIdx + 2);

    const nameMap = functionMaps.byFileAndName.get(filePath);
    if (nameMap) {
        // Exact name match (covers "ClassName.method" as stored by functions_extractor)
        const direct = nameMap.get(name);
        if (direct) return direct;

        // Short name fallback: "build" → finds "GlobalIndex.build"
        // Needed when calleeFunctionId was built before class name was known
        if (!name.includes(".")) {
            for (const [key, fn] of nameMap) {
                if (key.endsWith(`.${name}`)) return fn;
            }
        }
    }

    // 3. Cross-file fallback: search every file for a function with this name
    //    Used when the object was imported from an unknown source (callee resolved to null
    //    in the extractor). Matches "ClassName.method" OR bare "method" against all files.
    if (!name.includes(".")) {
        // Bare name — walk all files
        for (const [, fileNameMap] of functionMaps.byFileAndName) {
            const fn = fileNameMap.get(name);
            if (fn) return fn;
            // Also check qualified class method names ending in .name
            for (const [key, fn2] of fileNameMap) {
                if (key.endsWith(`.${name}`)) return fn2;
            }
        }
    } else {
        // Qualified "ClassName.method" — search all files for exact qualified name
        for (const [, fileNameMap] of functionMaps.byFileAndName) {
            const fn = fileNameMap.get(name);
            if (fn) return fn;
        }
    }

    return null;
}

// ─── fuzzy route matching ─────────────────────────────────────────────────────
// Normalize both sides to :param and match
function buildRouteIndex(allFiles) {
    // routeMatchKey → [route]
    const index = new Map();

    for (const [, data] of allFiles) {
        for (const route of data.routes ?? []) {
            const key = route.path
                ? route.path.replace(/\/:[a-zA-Z_][a-zA-Z0-9_]*/g, "/:param").toLowerCase()
                : null;
            if (!key) continue;
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(route);
        }
    }
    return index;
}

function matchApiCallToRoutes(apiCall, routeIndex) {
    const key = apiCall.routeMatchKey;
    if (!key) return [];

    // Exact match
    const baseKey = key.startsWith("dynamic:") ? key.slice(8) : key;
    if (routeIndex.has(baseKey)) {
        return routeIndex.get(baseKey).filter(r => r.method === apiCall.method || r.method === "ALL");
    }

    // Fuzzy: try without leading segment (for baseURL mismatches)
    const segments = baseKey.split("/").filter(Boolean);
    for (let i = 1; i < segments.length; i++) {
        const shorter = "/" + segments.slice(i).join("/");
        if (routeIndex.has(shorter)) {
            const candidates = routeIndex.get(shorter).filter(r => r.method === apiCall.method || r.method === "ALL");
            if (candidates.length) return candidates;
        }
    }

    return [];
}

// ─── main resolver ────────────────────────────────────────────────────────────
function resolve(allFiles) {
    // allFiles: Map<filePath, { functions, calls, events, imports, apiCalls, routes }>

    const graph          = new FlowGraph();
    const unresolvedCalls  = [];
    const unresolvedRoutes = [];
    const stats = {
        totalFunctions: 0, totalCalls: 0, totalEvents: 0,
        totalRoutes: 0, totalApiCalls: 0,
        resolvedCalls: 0, unresolvedCalls: 0,
        resolvedApiCalls: 0, unresolvedApiCalls: 0,
    };

    const functionMaps = buildFunctionMaps(allFiles);
    const routeIndex   = buildRouteIndex(allFiles);

    // ── Phase 1: Add all nodes ────────────────────────────────────────────────
    for (const [filePath, data] of allFiles) {
        for (const fn of data.functions ?? []) {
            graph.addNode(fn.id, "function", { name: fn.name, file: fn.file, startLine: fn.startLine, endLine: fn.endLine, isAsync: fn.isAsync, type: fn.type });
            stats.totalFunctions++;
        }
        for (const route of data.routes ?? []) {
            graph.addNode(route.id, "route", { method: route.method, path: route.path, file: route.file, startLine: route.startLine });
            stats.totalRoutes++;
        }
        for (const event of data.events ?? []) {
            const eventId = `${event.file}::event::${event.event}::${event.startLine}`;
            graph.addNode(eventId, "event", { event: event.event, element: event.element, component: event.component, file: event.file, startLine: event.startLine });
            stats.totalEvents++;
        }
        for (const apiCall of data.apiCalls ?? []) {
            const apiId = `${apiCall.file}::api::${apiCall.method}::${apiCall.normalizedUrl}::${apiCall.startLine}`;
            graph.addNode(apiId, "apiCall", { method: apiCall.method, url: apiCall.url, normalizedUrl: apiCall.normalizedUrl, file: apiCall.file, startLine: apiCall.startLine });
            stats.totalApiCalls++;
        }
    }

    // ── Phase 2: Link calls → functions ──────────────────────────────────────
    for (const [filePath, data] of allFiles) {
        const callerFnMap = functionMaps.byFileAndName.get(filePath) ?? new Map();

        for (const call of data.calls ?? []) {
            stats.totalCalls++;
            const callerFn = callerFnMap.get(call.from);
            const fromId   = callerFn?.id ?? `${filePath}::${call.from}`;

            const targetFn = resolveFunction(call.calleeFunctionId, functionMaps);

            if (targetFn) {
                graph.addEdge(fromId, targetFn.id, "calls", {
                    callee: call.callee, line: call.startLine, isCallback: call.isCallback,
                });
                stats.resolvedCalls++;
            } else {
                unresolvedCalls.push({ call, fromFile: filePath });
                stats.unresolvedCalls++;
            }
        }
    }

    // ── Phase 3: Link routes → handler functions ──────────────────────────────
    for (const [, data] of allFiles) {
        for (const route of data.routes ?? []) {
            if (!route.handlerFunctionId) continue;
            const handlerFn = resolveFunction(route.handlerFunctionId, functionMaps);
            if (handlerFn) {
                graph.addEdge(route.id, handlerFn.id, "handles", { line: route.startLine });
            }
        }
    }

    // ── Phase 4: Link events → handler functions ──────────────────────────────
    for (const [filePath, data] of allFiles) {
        for (const event of data.events ?? []) {
            const eventId = `${event.file}::event::${event.event}::${event.startLine}`;

            if (event.handlerFunctionId) {
                const handlerFn = resolveFunction(event.handlerFunctionId, functionMaps);
                if (handlerFn) graph.addEdge(eventId, handlerFn.id, "handles", { line: event.startLine });
            }

            // Also link all callsInside
            for (const [i, fnId] of (event.callFunctionIds ?? []).entries()) {
                const fn = resolveFunction(fnId, functionMaps);
                if (fn) graph.addEdge(eventId, fn.id, "calls", { callee: event.callsInside?.[i], line: event.startLine });
            }
        }
    }

    // ── Phase 5: Link apiCalls → routes ──────────────────────────────────────
    for (const [, data] of allFiles) {
        for (const apiCall of data.apiCalls ?? []) {
            const apiId = `${apiCall.file}::api::${apiCall.method}::${apiCall.normalizedUrl}::${apiCall.startLine}`;
            const matched = matchApiCallToRoutes(apiCall, routeIndex);

            if (matched.length > 0) {
                for (const route of matched) {
                    graph.addEdge(apiId, route.id, "requests", {
                        method: apiCall.method, url: apiCall.url, line: apiCall.startLine,
                    });
                }
                stats.resolvedApiCalls++;
            } else {
                unresolvedRoutes.push({ apiCall });
                stats.unresolvedApiCalls++;
            }

            // Link apiCall to the calling function
            if (apiCall.from) {
                const callerFnMap = functionMaps.byFileAndName.get(apiCall.file) ?? new Map();
                const callerFn = callerFnMap.get(apiCall.from);
                if (callerFn) graph.addEdge(callerFn.id, apiId, "calls", { line: apiCall.startLine });
            }
        }
    }

    // ── Phase 6: Link import edges (file-level) ───────────────────────────────
    for (const [filePath, data] of allFiles) {
        for (const imp of data.imports ?? []) {
            if (!imp.isLocal || !imp.resolvedPath) continue;
            const fileNodeId    = `file::${filePath}`;
            const targetNodeId  = `file::${imp.resolvedPath}`;
            graph.addNode(fileNodeId,   "file", { file: filePath });
            graph.addNode(targetNodeId, "file", { file: imp.resolvedPath });
            graph.addEdge(fileNodeId, targetNodeId, "imports", {
                name: imp.name, importedAs: imp.importedAs, type: imp.type,
            });
        }
    }

    return {
        graph: graph.toJSON(),
        graphInstance: graph,      // expose for traceFrom() usage
        unresolvedCalls,
        unresolvedRoutes,
        stats,
    };
}

// ─── convenience: trace a full UI → backend path ─────────────────────────────
function traceUIToBackend(graph, startEventId) {
    return graph.traceFrom(startEventId);
}

module.exports = { resolve, FlowGraph, traceUIToBackend };