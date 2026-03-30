/**
 * queryEngine.js
 * MAIN ENTRY POINT — orchestrates the full pipeline.
 *
 * Pipeline:
 *   resolveEntry (classify input as function | route | event)
 *     → resolverAdapter (lookup fnInfo by name/id/route/event)
 *       → graphTraversal (walk with fnInfo objects, keyed on IDs)
 *         → code_service (attach source code to every graph node)
 *           → filters (clean flow)
 *             → statsBuilder (summarise)
 *               → return result
 *
 * Public API
 *  ✅ analyzeFunction(input, direction, maxDepth)  — accepts fn name, route, or event
 *  ✅ getFunctionDefinition(name)
 *
 * Entry formats accepted by analyzeFunction():
 *  "loginUser"             → function lookup (existing behavior)
 *  "POST /api/login"       → route lookup → handler fn → forward trace
 *  "GET /users/:id"        → route lookup → handler fn → forward trace
 *  "onClick:LoginButton"   → event lookup → handler fn → forward trace
 *  "onSubmit:LoginForm"    → event lookup → handler fn → forward trace
 *  "onClick"               → event lookup, any element → forward trace
 *
 * ❌ No traversal logic   ❌ No filter logic   ❌ No index logic
 */

const resolver                                  = require("./resolverAdapter");
const { traceForward, traceBackward }           = require("./graphTraversal");
const { filterFlow }                            = require("./filters");
const { buildForwardStats, buildBackwardStats } = require("./statsBuilder");
const { attachCodeToNodes, extractCode }        = require("./code_service");
const { index }                                 = require("./indexBuilder");

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
    // Must start with "on" + uppercase letter (React/DOM event convention)
    const eventMatch = trimmed.match(/^(on[A-Z][a-zA-Z]*)(?::(.+))?$/);
    if (eventMatch) {
        return {
            type:    "event",
            event:   eventMatch[1],           // "onClick"
            element: eventMatch[2] ?? null,   // "LoginButton" | null
        };
    }

    // ── Default: bare function name ───────────────────────────────────────────
    return { type: "function", name: trimmed };
}

// ─── Event handler lookup ─────────────────────────────────────────────────────

/**
 * Scan all indexed files for a matching JSX event attribute and return
 * the resolved handler fnInfo.
 *
 * @param   {string}      eventName  - "onClick"
 * @param   {string|null} element    - "LoginButton" | null (any element)
 * @returns {{ fnInfo, eventMeta }|null}
 */
function findEventHandler(eventName, element) {
    for (const [relativePath, data] of index.files) {
        for (const evt of (data.events ?? [])) {
            if (evt.event !== eventName) continue;
            if (element && evt.element !== element) continue;

            // Named handler: onClick={handleLogin}
            if (evt.handler && evt.handler !== "inline" && evt.handler !== "conditional" && evt.handler !== "dynamic") {
                const fnInfo = resolver.findFunction(evt.handler, relativePath);
                if (fnInfo) return { fnInfo, eventMeta: evt };
            }

            // Inline multi-call: onClick={() => { a(); b(); }} — use first resolvable
            for (const callName of (evt.callsInside ?? [])) {
                const fnInfo = resolver.findFunction(callName, relativePath);
                if (fnInfo) return { fnInfo, eventMeta: evt };
            }
        }
    }
    return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse from any entry point — function name, route, or event.
 *
 * @param   {string}               input      - fn name | "METHOD /path" | "onEvent:Element"
 * @param   {"forward"|"backward"} [direction="forward"]
 * @param   {number|null}          [maxDepth=null]
 * @returns {object}
 */
function analyzeFunction(input, direction = "forward", maxDepth = null) {
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
        return _runForward(fnInfo, maxDepth ?? 8, {
            entryType: "route",
            route:     { method: route.method, path: route.path, file: route.file },
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
    const fnInfo = resolver.findFunction(entry.name);
    if (!fnInfo) {
        return { error: `Function "${input}" not found in index.` };
    }
    return direction === "backward"
        ? _runBackward(fnInfo, maxDepth ?? 4)
        : _runForward(fnInfo, maxDepth ?? 8, { entryType: "function" });
}

/**
 * Return the file location + code of a function definition.
 *
 * @param   {string} name
 * @returns {{ file, startLine, endLine, code }|null}
 */
function getFunctionDefinition(name) {
    const fnInfo = resolver.findFunction(name);
    if (!fnInfo) return null;

    return {
        file:      fnInfo.file,
        startLine: fnInfo.startLine,
        endLine:   fnInfo.endLine,
        code:      extractCode(fnInfo.file, fnInfo.startLine, fnInfo.endLine) ?? null,
    };
}

// ─── Private orchestration ────────────────────────────────────────────────────

function _runForward(fnInfo, maxDepth, entryMeta = {}) {
    const { flow: rawFlow, nodes: rawNodes, edges } = traceForward(fnInfo, maxDepth);

    const nodes = attachCodeToNodes(rawNodes);
    const flow  = filterFlow(rawFlow);
    const stats = buildForwardStats(flow);

    return {
        flow,
        fullGraph: { nodes, edges },
        stats,
        meta: {
            entryId:   fnInfo.id,
            entryName: fnInfo.name,
            maxDepth,
            direction: "forward",
            ...entryMeta,
        },
    };
}

function _runBackward(fnInfo, maxDepth) {
    const { flow, nodes: rawNodes, edges } = traceBackward(fnInfo, maxDepth);

    const nodes = attachCodeToNodes(rawNodes);
    const stats = buildBackwardStats(flow);

    return {
        target:    fnInfo.name,
        targetId:  fnInfo.id,
        flow,
        fullGraph: { nodes, edges },
        stats,
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