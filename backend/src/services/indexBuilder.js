/**
 * indexBuilder.js
 * BUILD LAYER — collect and organise raw parsed data from the repo.
 *
 * Responsibilities
 * ✅ Walk repo files
 * ✅ Parse entire project at once via TS analyzeProject
 * ✅ Index functions by ID    ("file::name::startLine" → definition)
 * ✅ Index functions by name  (name → [ids])  — proximity hint only
 * ✅ Index routes by "METHOD::path"            — no overwrite on same path
 * ✅ Index files    (relativePath → parsed data)
 *
 * ❌ No reverseMap  (relationship concern — lives in resolverAdapter)
 * ❌ No traversal   ❌ No filtering   ❌ No resolution logic
 */

const path = require("path");
const { fileWalker: getAllFiles } = require("../utils/fileWalker");
const { analyzeProject }          = require("../parser/engine/parserEngine"); // <-- New TS Engine Import

// ─── Canonical ID builders (exported so all layers use the same format) ───────

/**
 * Unique function identity used throughout the entire pipeline.
 * Format:  "src/auth/login.js::login::12"
 *
 * @param {string}      file
 * @param {string}      name
 * @param {number|null} startLine
 */
function makeFunctionId(file, name, startLine) {
    return `${file}::${name}::${startLine ?? "?"}`;
}

/**
 * Unique route identity — method + path, so GET and POST on the same
 * path are stored as separate entries.
 * Format:  "GET::/users/:id"
 *
 * @param {string} method
 * @param {string} routePath
 */
function makeRouteId(method, routePath) {
    return `${(method ?? "ANY").toUpperCase()}::${routePath}`;
}

// ─── IndexBuilder ─────────────────────────────────────────────────────────────

class IndexBuilder {
    constructor() {
        this.repoPath = null;

        /**
         * Primary function index — ID → definition.
         * Zero collisions possible: ID encodes file + name + line.
         * @type {Map<string, { id, name, file, startLine, endLine, type }>}
         */
        this.functionsById = new Map();

        /**
         * Secondary name index — name → [id, ...].
         * Used ONLY as a proximity hint in resolverAdapter when a full ID
         * is not available (e.g. entry point lookup by name from the UI).
         * @type {Map<string, string[]>}
         */
        this.functionsByName = new Map();

        /**
         * Route index — "METHOD::path" → route data.
         * GET /users and POST /users coexist without collision.
         * @type {Map<string, { id, handler, file, method, path }>}
         */
        this.routes = new Map();

        /**
         * Reverse index for routes — handlerName → [routeData, ...].
         * @type {Map<string, object[]>}
         */
        this.routesByHandler = new Map();

        /**
         * Event index — "event::element" → event data.
         * @type {Map<string, { id, handler, file, event, element }>}
         */
        this.events = new Map();

        /**
         * Reverse index for events — handlerId → [eventData, ...].
         * @type {Map<string, object[]>}
         */
        this.eventsByHandler = new Map();

        /**
         * Raw parsed data per relative file path.
         * @type {Map<string, object>}
         */
        this.files = new Map();

        /**
         * Flag to signal resolverAdapter that reverseMap should be invalidated
         * Set to true by _invalidateReverseMap() when index is rebuilt
         */
        this._reverseMapInvalidated = false;
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /**
     * Scans repoPath, parses every supported file in one TS batch, and populates all indexes.
     * Idempotent — calling build() again resets and rebuilds cleanly.
     *
     * @param {string} repoPath - Absolute path to the repository root
     */
    async build(repoPath) {
        this.repoPath = repoPath;
        this._reset();

        // Invalidate code cache — new repo or re-scan means files may have changed
        try { require("./codeService").clearCache(); } catch (_) { /* optional dep */ }

        // 1. Grab all files in the repo
        const allAbsolutePaths = getAllFiles(repoPath);
        
        // 2. Feed them ALL into the new TypeScript engine at once
        const projectDataMap = await analyzeProject(allAbsolutePaths);

        // 3. Loop through the results and populate your indexes
        for (const [absolutePath, data] of projectDataMap.entries()) {
            const relativePath = this._toRelative(absolutePath, repoPath);
            
            if (!data) continue;

            this.files.set(relativePath, data);
            this._indexFunctions(relativePath, data.functions ?? []);
            this._indexRoutes(relativePath, data.routes ?? []);
            this._indexEvents(relativePath, data.events ?? []);
        }

        console.log(
            `[indexBuilder] built` +
            ` | files: ${this.files.size}` +
            ` | functions: ${this.functionsById.size}` +
            ` | routes: ${this.routes.size}` +
            ` | events: ${this.events.size}`
        );
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    _reset() {
        this.functionsById.clear();
        this.functionsByName.clear();
        this.routes.clear();
        this.routesByHandler.clear();
        this.events.clear();
        this.eventsByHandler.clear();
        this.files.clear();
        this._invalidateReverseMap();
    }

    _invalidateReverseMap() {
        // Called whenever index is rebuilt to force reverseMap reconstruction
        // This is a hook that resolverAdapter will check
        this._reverseMapInvalidated = true;
    }

    _toRelative(absolutePath, repoPath) {
        return path.relative(repoPath, absolutePath).split(path.sep).join("/");
    }

    _indexFunctions(relativePath, functions) {
        for (const fn of functions) {
            const startLine = fn.startLine ?? fn.line ?? null;

            // Prefer extractor-stamped id; fall back to canonical builder
            const id = fn.id ?? makeFunctionId(relativePath, fn.name, startLine);

            const entry = {
                id,
                name:      fn.name,
                file:      relativePath,
                startLine,
                endLine:   fn.endLine ?? null,
                type:      fn.type    ?? "function",
            };

            this.functionsById.set(id, entry);

            if (!this.functionsByName.has(fn.name)) {
                this.functionsByName.set(fn.name, []);
            }
            this.functionsByName.get(fn.name).push(id);
        }
    }

    _indexRoutes(relativePath, routes) {
        for (const route of routes) {
            const id = makeRouteId(route.method, route.path);

            if (this.routes.has(id)) {
                console.warn(
                    `[indexBuilder] duplicate route ${id} in ${relativePath}` +
                    ` (already registered in ${this.routes.get(id).file}) — skipped`
                );
                continue;
            }

            const routeData = {
                id,
                handler: route.handler,
                file:    relativePath,
                method:  (route.method ?? "ANY").toUpperCase(),
                path:    route.path,
            };

            this.routes.set(id, routeData);

            if (route.handler) {
                if (!this.routesByHandler.has(route.handler)) {
                    this.routesByHandler.set(route.handler, []);
                }
                this.routesByHandler.get(route.handler).push(routeData);
            }
        }
    }

    _indexEvents(relativePath, events) {
        for (const event of events) {
            const id = `${event.event}::${event.element}`;

            if (this.events.has(id)) {
                console.warn(
                    `[indexBuilder] duplicate event ${id} in ${relativePath}` +
                    ` (already registered in ${this.events.get(id).file}) — skipped`
                );
                continue;
            }

            const eventData = {
                id,
                handler: event.handlerFunctionId,
                file:    relativePath,
                event:   event.event,
                element: event.element,
            };

            this.events.set(id, eventData);

            if (event.handlerFunctionId) {
                if (!this.eventsByHandler.has(event.handlerFunctionId)) {
                    this.eventsByHandler.set(event.handlerFunctionId, []);
                }
                this.eventsByHandler.get(event.handlerFunctionId).push(eventData);
            }
        }
    }
}

// Singleton — one global index per process
const instance = new IndexBuilder();
module.exports = { index: instance, makeFunctionId, makeRouteId };