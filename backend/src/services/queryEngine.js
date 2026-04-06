 /**

 * queryEngine.js

 * MAIN ENTRY POINT — orchestrates the full pipeline.

 *

 * Pipeline:

 * resolveEntry (classify input as function | route | event)

 * → resolverAdapter (lookup fnInfo by name/id/route/event)

 * → graphTraversal (walk with fnInfo objects, keyed on IDs)

 * → codeService (attach source code to every graph node)

 * → filters (clean flow)

 * → statsBuilder (summarise)

 * → **TELEMETRY INJECTION (NEW)**

 * → return result

 */


const resolver                  = require("./resolverAdapter");

const { traceForward, traceBackward }           = require("./graphTraversal");

const { filterFlow }                            = require("./filters");

const { buildForwardStats, buildBackwardStats } = require("./statsBuilder");

const { attachCodeToNodes, extractCode }        = require("./codeService");

const { index }                                 = require("./indexBuilder");

const dynamicStore                              = require("./dynamicStore"); // 👈 NEW: Telemetry Store


// ─── Entry classifier ─────────────────────────────────────────────────────────


/**

 * Classify an arbitrary input string into one of three entry types.

 *

 * @param   {string} input

 * @returns {{ type: 'function'|'route'|'event', [key]: string }}

 */

function resolveEntry(input) {

    if (!input || typeof input !== "string") return { type: "function", name: String(input) };


    const trimmed = input.trim();


    // ── Route: "POST /api/login" | "GET /users/:id" ───────────────────────────

    const routeMatch = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+(\S+)$/i);

    if (routeMatch) {

        return {

            type:   "route",

            method: routeMatch[1].toUpperCase(),

            path:   routeMatch[2],

        };

    }


    // ── Event: "onClick:LoginButton" | "onSubmit" ─────────────────────────────

    const eventMatch = trimmed.match(/^(on[A-Z][a-zA-Z]*)(?::(.+))?$/);

    if (eventMatch) {

        return {

            type:    "event",

            event:   eventMatch[1],           

            element: eventMatch[2] ?? null,   

        };

    }


    // ── Default: bare function name ───────────────────────────────────────────

    return { type: "function", name: trimmed };

}


// ─── Event handler lookup ─────────────────────────────────────────────────────


function findEventHandler(eventName, element) {
    const eventId = `${eventName}::${element}`;
    const evt = index.events.get(eventId);

    if (!evt) return null;

    if (evt.handler && evt.handler !== "inline" && evt.handler !== "conditional" && evt.handler !== "dynamic") {
        const fnInfo = resolver.findFunction(evt.handler, evt.file);
        if (fnInfo) return { fnInfo, eventMeta: evt };
    }

    // Fallback for cases where handler is in callsInside (if available in indexed data)
    // Note: The index currently only stores 'handler'. 
    // If we need 'callsInside', we still need the file lookup, but it's only one file.
    if (evt.file) {
        const fileData = index.files.get(evt.file);
        const rawEvt = (fileData?.events ?? []).find(e => e.event === eventName && e.element === element);
        if (rawEvt) {
            for (const callName of (rawEvt.callsInside ?? [])) {
                const fnInfo = resolver.findFunction(callName, evt.file);
                if (fnInfo) return { fnInfo, eventMeta: evt };
            }
        }
    }

    return null;
}


// ─── Public API ───────────────────────────────────────────────────────────────


function analyzeFunction(input, direction = "forward", maxDepth = null, fileHint = null) {
    const entry = resolveEntry(input);


    // ── Route entry ───────────────────────────────────────────────────────────

    if (entry.type === "route") {

        const route = resolver.findRoute(entry.path, entry.method);

        if (!route) {

            return { error: `Route "${input}" not found in index.` };

        }

        if (!route.handler || route.handler === "inline") {

            return { error: `Route "${input}" has an inline handler — no named function to trace.` };

        }

        const fnInfo = resolver.findFunction(route.handler, route.file);

        if (!fnInfo) {

            return { error: `Handler "${route.handler}" for route "${input}" not found in index.` };

        }



        // 👈 NEW: Fetch live telemetry data for this route before running the trace

        const liveMetrics = dynamicStore.getMetricsForRoute(route.method, route.path);


        return _runForward(fnInfo, maxDepth ?? 8, {

            entryType: "route",

            route:     { method: route.method, path: route.path, file: route.file },

            telemetry: liveMetrics // 👈 NEW: Pass to orchestrator

        });

    }


    // ── Event entry ───────────────────────────────────────────────────────────

    if (entry.type === "event") {

        const found = findEventHandler(entry.event, entry.element);

        if (!found) {

            const label = entry.element ? `${entry.event}:${entry.element}` : entry.event;

            return { error: `Event "${label}" not found in index.` };

        }

        return _runForward(found.fnInfo, maxDepth ?? 8, {

            entryType: "event",

            event:     found.eventMeta,

        });

    }


    // ── Function entry (default) ──────────────────────────────────────────────

    const fnInfo = resolver.findFunction(entry.name, fileHint);

    if (!fnInfo) {

        return { error: `Function "${input}" not found in index.` };

    }


    return direction === "backward"

        ? _runBackward(fnInfo, maxDepth ?? 4)

        : _runForward(fnInfo, maxDepth ?? 8, { entryType: "function" });

}


function getFunctionDefinition(name) {

    const fnInfo = resolver.findFunction(name);

    if (!fnInfo) return null;


    return {

        file:      fnInfo.file,

        startLine: fnInfo.startLine,

        endLine:   fnInfo.endLine,
       
        nodeId:    `${fnInfo.file}:${fnInfo.startLine}`,
        code:      extractCode(fnInfo.file, fnInfo.startLine, fnInfo.endLine) ?? null,

    };

}


// ─── Private orchestration ────────────────────────────────────────────────────


function _runForward(fnInfo, maxDepth, entryMeta = {}) {
    const { flow: rawFlow, nodes: rawNodes, edges } = traceForward(fnInfo, maxDepth);

    // 🟢 UPDATE: Attach nodeId (file:line) to every node
    const nodesWithCode = attachCodeToNodes(rawNodes);
    const nodes = nodesWithCode.map(n => ({
        ...n,
        nodeId: n.file && n.startLine ? `${n.file}:${n.startLine}` : n.id
    }));

    const flow = filterFlow(rawFlow);
    const stats = buildForwardStats(flow);

    let telemetryPayload = null;
    if (entryMeta.telemetry) {
        telemetryPayload = {
            hits: entryMeta.telemetry.hitCount,
            averageExecutionTimeMs: Number(entryMeta.telemetry.avgTime.toFixed(2)),
            lastExecutionTimeMs: Number(entryMeta.telemetry.lastDuration.toFixed(2)),
            latestTraceId: entryMeta.telemetry.lastTraceId,
            status: entryMeta.telemetry.avgTime > 1000 ? 'CRITICAL' :
                   (entryMeta.telemetry.avgTime > 500 ? 'WARNING' : 'HEALTHY')
        };
    }

    return {
        flow,
        fullGraph: { nodes, edges },
        stats,
        telemetry: telemetryPayload,
        meta: {
            entryId: fnInfo.id,
            entryName: fnInfo.name,
            maxDepth,
            direction: "forward",
            entryType: entryMeta.entryType,
            ...(entryMeta.route && { route: entryMeta.route }),
            ...(entryMeta.event && { event: entryMeta.event })
        },
    };
}

function _runBackward(fnInfo, maxDepth) {
    const { flow, nodes: rawNodes, edges } = traceBackward(fnInfo, maxDepth);

    // 🟢 UPDATE: Attach nodeId (file:line) to every node
    const nodesWithCode = attachCodeToNodes(rawNodes);
    const nodes = nodesWithCode.map(n => ({
        ...n,
        nodeId: n.file && n.startLine ? `${n.file}:${n.startLine}` : n.id
    }));

    const stats = buildBackwardStats(flow);

    return {
        target:    fnInfo.name,
        targetId:  fnInfo.id,
        flow,
        fullGraph: { nodes, edges },
        stats,
        telemetry: null,
        meta: {
            entryId:   fnInfo.id,
            entryName: fnInfo.name,
            maxDepth,
            direction: "backward",
            entryType: "function",
        },
    };
}

module.exports = { analyzeFunction, getFunctionDefinition };


