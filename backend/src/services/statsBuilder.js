/**
 * statsBuilder.js
 * ANALYTICS LAYER — summarise a completed flow or backward-trace result.
 *
 * Responsibilities
 *  ✅ Count steps by type (functions, api, events, routes, external)
 *  ✅ Count unique files touched
 *  ✅ Build forward-flow stats
 *  ✅ Build backward-trace stats
 *
 * ❌ No traversal   ❌ No resolution   ❌ No filtering
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const byType = (flow, type) => flow.filter(f => f.type === type).length;

const uniqueFiles = (flow) =>
    new Set(flow.map(f => f.file).filter(Boolean)).size;

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Build stats for a forward flow (trace).
 *
 * @param   {object[]} flow - Filtered flow steps
 * @returns {object}
 */
function buildForwardStats(flow) {
    return {
        steps:       flow.length,
        uniqueFiles: uniqueFiles(flow),
        functions:   byType(flow, "function"),
        apiCalls:    byType(flow, "api"),
        external:    byType(flow, "external"),
        events:      byType(flow, "event"),
        routes:      byType(flow, "route"),
    };
}

/**
 * Build stats for a backward trace (getUsedBy / callers).
 *
 * @param   {object[]} flow - Flow steps from backward traversal
 * @returns {object}
 */
function buildBackwardStats(flow) {
    return {
        totalCallers: byType(flow, "function"),
        uniqueFiles:  uniqueFiles(flow),
        events:       byType(flow, "event"),
    };
}

module.exports = { buildForwardStats, buildBackwardStats };
