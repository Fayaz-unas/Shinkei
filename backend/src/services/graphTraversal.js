/**
 * graphTraversal.js
 * EXECUTION ENGINE — walk the call graph, produce nodes/edges/flow.
 *
 * Responsibilities
 *  ✅ Forward DFS  (function → calls → API → route handler → …)
 *  ✅ Backward BFS (who calls this function, recursively)
 *  ✅ Cycle prevention  (callStack / visited sets keyed on function ID)
 *  ✅ Depth control
 *  ✅ Node + edge deduplication
 *
 * ❌ No direct index access — all data comes through resolverAdapter
 * ❌ No filtering           — delegates to filters.js
 * ❌ No stats               — delegates to statsBuilder.js
 */

const resolver              = require("./resolverAdapter");
const { isRelevantCall }    = require("./filters");

// ─── Shared graph factory (created fresh per traversal) ───────────────────────

function createGraph() {
    const nodes   = [];
    const edges   = [];
    const nodeMap = new Map();  // nodeKey → node id
    const flowSet = new Set();  // dedup keys for flow steps
    const flow    = [];

    function upsertNode(key, label, file, startLine, endLine, type) {
        if (nodeMap.has(key)) return nodeMap.get(key);
        const id = `node_${nodes.length}`;
        nodeMap.set(key, id);
        nodes.push({ id, label, file, startLine, endLine, type });
        return id;
    }

    function addEdge(fromId, toId) {
        if (!fromId || !toId || fromId === toId) return;
        if (!edges.some(e => e.from === fromId && e.to === toId)) {
            edges.push({ from: fromId, to: toId });
        }
    }

    function pushFlow(entry) {
        const key = `${entry.type}:${entry.label}:${entry.file}`;
        if (flowSet.has(key)) return;
        flowSet.add(key);
        flow.push({ ...entry, step: flow.length + 1 });
    }

    return { nodes, edges, flow, upsertNode, addEdge, pushFlow };
}

// ─── File classification ───────────────────────────────────────────────────────

function classifyFile(file) {
    if (!file) return "backend";
    const f = file.toLowerCase();
    if (f.endsWith(".jsx")) return "frontend";
    if (f.includes("frontend") || f.includes("client") || f.includes("ui")) return "frontend";
    if (f.includes("pages") || f.includes("components") || f.includes("views")) return "frontend";
    return "backend";
}

// ─── Forward DFS ──────────────────────────────────────────────────────────────

/**
 * Trace forward from `entryFnInfo`.
 * Traversal is keyed on function IDs — no name-collision risk.
 *
 * @param   {{ id, name, file, startLine, endLine }} entryFnInfo
 * @param   {number} [maxDepth=8]
 * @returns {{ flow, nodes, edges }}
 */
function traceForward(entryFnInfo, maxDepth = 8) {
    const { nodes, edges, flow, upsertNode, addEdge, pushFlow } = createGraph();
    const fullyProcessed = new Set();   // Set<fnId>

    function dfs(fnInfo, callerNodeId = null, callStack = new Set(), depth = 0) {
        if (depth > maxDepth) return;
        if (callStack.has(fnInfo.id)) return;   // cycle guard — ID-keyed

        const nodeType = classifyFile(fnInfo.file);
        const nodeId   = upsertNode(fnInfo.id, fnInfo.name, fnInfo.file, fnInfo.startLine, fnInfo.endLine, nodeType);
        addEdge(callerNodeId, nodeId);

        pushFlow({
            label:     fnInfo.name,
            file:      fnInfo.file,
            startLine: fnInfo.startLine,
            endLine:   fnInfo.endLine,
            type:      "function",
            layer:     nodeType,
        });

        if (fullyProcessed.has(fnInfo.id)) return;
        callStack.add(fnInfo.id);

        const fileData = resolver.getFileData(fnInfo.file);
        if (fileData) {

            // ── API calls ──────────────────────────────────────────────────────
            const apiCalls = (fileData.apiCalls ?? []).filter(a => a.from === fnInfo.name);
            for (const api of apiCalls) {
                const apiLabel = `${api.method} ${api.url ?? "unknown"}`;
                const apiId    = upsertNode(`api:${apiLabel}`, apiLabel, fnInfo.file, api.line, null, "api");
                addEdge(nodeId, apiId);
                pushFlow({ label: apiLabel, file: fnInfo.file, startLine: api.line, endLine: null, type: "api" });

                const route = resolver.findRoute(api.url, api.method);
                if (route?.handler) {
                    const handlerInfo = resolver.findFunction(route.handler, route.file);
                    if (handlerInfo) dfs(handlerInfo, apiId, new Set(callStack), depth + 1);
                }
            }

            // ── Outbound calls ─────────────────────────────────────────────────
            const calls = resolver.getCalls(fnInfo, fileData);
            for (const call of calls) {
                if (!isRelevantCall(call.name, call.object, resolver.knowsFunction)) continue;

                if (call.object) {
                    const resolved = resolver.findFunction(call.name, fnInfo.file);
                    if (resolved) {
                        dfs(resolved, nodeId, new Set(callStack), depth + 1);
                    } else {
                        const label = `${call.object}.${call.name}()`;
                        const extId = upsertNode(`ext:${label}`, label, fnInfo.file, call.line, null, "external");
                        addEdge(nodeId, extId);
                        pushFlow({ label, file: fnInfo.file, startLine: call.line, endLine: null, type: "external" });
                    }
                    continue;
                }

                const resolved = resolver.findFunction(call.name, fnInfo.file);
                if (resolved) {
                    dfs(resolved, nodeId, new Set(callStack), depth + 1);
                } else {
                    const label = `${call.name}()`;
                    const extId = upsertNode(`ext:${label}`, label, fnInfo.file, call.line, null, "external");
                    addEdge(nodeId, extId);
                    pushFlow({ label, file: fnInfo.file, startLine: call.line, endLine: null, type: "external" });
                }
            }

            // ── Events ────────────────────────────────────────────────────────
            for (const evt of (fileData.events ?? [])) {
                const triggers = evt.handler === fnInfo.name || (evt.callsInside ?? []).includes(fnInfo.name);
                if (!triggers) continue;
                const label = `${evt.event} on <${evt.element}>`;
                const eId   = upsertNode(`evt:${fnInfo.file}:${evt.line}`, label, fnInfo.file, evt.line, null, "event");
                addEdge(eId, nodeId);
                pushFlow({ label, file: fnInfo.file, startLine: evt.line, endLine: null, type: "event" });
            }

            // ── Routes that declare this function as their handler ─────────────
            const routesForFn = resolver.getRoutesForHandler(fnInfo.name);
            for (const routeData of routesForFn) {
                const rLabel = `${routeData.method} ${routeData.path}`;
                const rId    = upsertNode(`route:${routeData.id}`, rLabel, routeData.file, null, null, "route");
                addEdge(rId, nodeId);
                pushFlow({ label: rLabel, file: routeData.file, startLine: null, endLine: null, type: "route" });
            }
        }

        callStack.delete(fnInfo.id);
        fullyProcessed.add(fnInfo.id);
    }

    dfs(entryFnInfo);
    return { flow, nodes, edges };
}

// ─── Backward BFS ─────────────────────────────────────────────────────────────

/**
 * Trace backward from `entryFnInfo` — finds all callers recursively.
 * Traversal is keyed on function IDs.
 *
 * @param   {{ id, name, file, startLine, endLine }} entryFnInfo
 * @param   {number} [maxDepth=4]
 * @returns {{ flow, nodes, edges, targetNodeId }}
 */
function traceBackward(entryFnInfo, maxDepth = 4) {
    const { nodes, edges, flow, upsertNode, addEdge, pushFlow } = createGraph();
    const visited = new Set();   // Set<fnId>

    const targetId = upsertNode(
        entryFnInfo.id,
        entryFnInfo.name,
        entryFnInfo.file,
        entryFnInfo.startLine,
        entryFnInfo.endLine,
        classifyFile(entryFnInfo.file)
    );

    const queue = [{ fnInfo: entryFnInfo, nodeId: targetId, depth: 0 }];

    while (queue.length > 0) {
        const { fnInfo: current, nodeId: currentNodeId, depth } = queue.shift();

        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (depth >= maxDepth) continue;

        // ── Callers via ID-based reverse map ──────────────────────────────────
        for (const callerInfo of resolver.getUsedBy(current.id)) {
            if (!isRelevantCall(callerInfo.name, null, resolver.knowsFunction)) continue;

            const callerId = upsertNode(
                callerInfo.id,
                callerInfo.name,
                callerInfo.file,
                callerInfo.startLine,
                callerInfo.endLine,
                classifyFile(callerInfo.file)
            );

            addEdge(callerId, currentNodeId);
            pushFlow({
                label:     callerInfo.name,
                calls:     current.name,
                file:      callerInfo.file,
                startLine: callerInfo.startLine,
                endLine:   callerInfo.endLine,
                type:      "function",
                layer:     classifyFile(callerInfo.file),
            });

            queue.push({ fnInfo: callerInfo, nodeId: callerId, depth: depth + 1 });
        }

        // ── Events that trigger the current function ───────────────────────────
        const fileData = resolver.getFileData(current.file);
        if (fileData) {
            for (const evt of (fileData.events ?? [])) {
                const triggers = evt.handler === current.name || (evt.callsInside ?? []).includes(current.name);
                if (!triggers) continue;
                const label = `${evt.event} on <${evt.element}>`;
                const eId   = upsertNode(`evt:${current.file}:${evt.line}`, label, current.file, evt.line, null, "event");
                addEdge(eId, currentNodeId);
                pushFlow({ label, file: current.file, startLine: evt.line, endLine: null, type: "event", calls: current.name });
            }
        }
    }

    return { flow, nodes, edges, targetNodeId: targetId };
}

module.exports = { traceForward, traceBackward };