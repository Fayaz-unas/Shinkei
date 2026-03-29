/**
 * filters.js
 * NOISE CONTROL — decide what is useful vs noise in a flow.
 *
 * Responsibilities
 *  ✅ SKIP_NAMES       — built-in / irrelevant method names
 *  ✅ SKIP_OBJECTS     — native JS / Node objects to ignore
 *  ✅ ALLOWED_EXTERNALS — 3rd-party boundaries worth tracing
 *  ✅ isRelevantCall() — traversal gate (should we follow this call?)
 *  ✅ filterFlow()     — post-traversal noise removal from the flow array
 *
 * ❌ No traversal   ❌ No graph building   ❌ No index access
 *
 * Note: isRelevantCall receives a `knowsFunction` callback injected by the
 * caller (graphTraversal) — filters.js never imports the index or resolver
 * directly, keeping the dependency graph clean.
 */

// ─── Blacklists ───────────────────────────────────────────────────────────────

/** Native JS / Node objects — calls on these are never user-land logic */
const SKIP_OBJECTS = new Set([
    "console", "Math", "JSON", "Object", "Array", "Promise",
    "Date", "String", "Number", "process",
    "fs", "path", "util", "stream", "http", "https", "Buffer", "crypto",
]);

/** Method / function names that are structural noise, not business logic */
const SKIP_NAMES = new Set([
    "map", "filter", "reduce", "push", "pop", "slice", "splice",
    "split", "replace", "trim", "then", "catch", "finally",
    "name", "line", "file", "type", "path", "handler",
    "length", "size", "has", "get", "set", "add", "delete", "clear",
]);

// ─── Whitelist ────────────────────────────────────────────────────────────────

/** 3rd-party boundaries that ARE worth tracing (API clients, ORMs, etc.) */
const ALLOWED_EXTERNALS = new Set([
    "axios", "fetch", "mongoose", "prisma",
]);

// ─── Traversal gate ───────────────────────────────────────────────────────────

/**
 * Returns true if a call is worth following during traversal.
 *
 * @param {string|null}   callName      - The function/method name being called
 * @param {string|null}   objectName    - The receiver object (e.g. "axios" in axios.get)
 * @param {function}      knowsFunction - (name: string) => boolean
 *                                        Injected by graphTraversal — avoids
 *                                        filters.js importing the resolver.
 * @returns {boolean}
 */
function isRelevantCall(callName, objectName, knowsFunction) {
    if (!callName) return false;

    if (SKIP_NAMES.has(callName))                      return false;
    if (objectName && SKIP_OBJECTS.has(objectName))    return false;

    if (knowsFunction(callName))                       return true;

    if (objectName && ALLOWED_EXTERNALS.has(objectName)) return true;
    if (ALLOWED_EXTERNALS.has(callName))               return true;

    return false;
}

// ─── Post-traversal flow filter ───────────────────────────────────────────────

/**
 * Strips noise steps from a completed flow array.
 * Boundary types (api, route, event, external) are always kept.
 *
 * @param   {object[]} flow - Raw flow steps from graphTraversal
 * @returns {object[]}
 */
function filterFlow(flow) {
    return flow.filter(step => {
        if (["api", "route", "event", "external"].includes(step.type)) return true;

        const name = step.label?.replace("()", "").split(".").pop();
        if (SKIP_NAMES.has(name)) return false;

        const obj = step.label?.split(".")[0];
        if (SKIP_OBJECTS.has(obj)) return false;

        return true;
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    SKIP_OBJECTS,
    SKIP_NAMES,
    ALLOWED_EXTERNALS,
    isRelevantCall,
    filterFlow,
};
