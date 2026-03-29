/**
 * queryEngine.js
 * MAIN ENTRY POINT — orchestrates the full pipeline.
 *
 * Pipeline:
 *   resolverAdapter (lookup fnInfo by name/id)
 *     → graphTraversal (walk with fnInfo objects, keyed on IDs)
 *       → code_service (attach source code to every graph node)
 *         → filters (clean flow)
 *           → statsBuilder (summarise)
 *             → return result
 *
 * Public API
 *  ✅ analyzeFunction(name, direction, maxDepth)
 *  ✅ getFunctionDefinition(name)
 *
 * ❌ No traversal logic   ❌ No filter logic   ❌ No index logic
 */

const resolver                             = require("./resolverAdapter");
const { traceForward, traceBackward }      = require("./graphTraversal");
const { filterFlow }                       = require("./filters");
const { buildForwardStats, buildBackwardStats } = require("./statsBuilder");
const { attachCodeToNodes }                = require("./code_service");

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a function — forward (what does it call?) or backward (who calls it?).
 *
 * @param   {string}               name
 * @param   {"forward"|"backward"} [direction="forward"]
 * @param   {number|null}          [maxDepth=null]
 * @returns {object}
 */
function analyzeFunction(name, direction = "forward", maxDepth = null) {
    const fnInfo = resolver.findFunction(name);
    if (!fnInfo) {
        return { error: `Function "${name}" not found in index.` };
    }

    return direction === "backward"
        ? _runBackward(fnInfo, maxDepth ?? 4)
        : _runForward(fnInfo, maxDepth ?? 8);
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

    const { extractCode } = require("./code_service");
    const code = extractCode(fnInfo.file, fnInfo.startLine, fnInfo.endLine);

    return {
        file:      fnInfo.file,
        startLine: fnInfo.startLine,
        endLine:   fnInfo.endLine,
        code:      code ?? null,
    };
}

// ─── Private orchestration ────────────────────────────────────────────────────

function _runForward(fnInfo, maxDepth) {
    const { flow: rawFlow, nodes: rawNodes, edges } = traceForward(fnInfo, maxDepth);

    // Attach source code to every node before returning
    const nodes = attachCodeToNodes(rawNodes);
    const flow  = filterFlow(rawFlow);
    const stats = buildForwardStats(flow);

    return {
        flow,
        fullGraph: { nodes, edges },
        stats,
        meta: { entryId: fnInfo.id, maxDepth, direction: "forward" },
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
        meta: { entryId: fnInfo.id, maxDepth, direction: "backward" },
    };
}

module.exports = { analyzeFunction, getFunctionDefinition };