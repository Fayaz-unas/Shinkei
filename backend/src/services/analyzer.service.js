const path           = require("path");
const { getAllFiles } = require("../utils/fileWalker");
const { runParser }  = require("../parser/engine/parserEngine");

/**
 * analyzer.service.js
 *
 * THE INTELLIGENCE LAYER — builds a global index and traces execution flows.
 */

// ── 1. STRICT BLACKLISTS (The Noise) ──────────────────────────────────────────
const SKIP_OBJECTS = new Set([
    // JS Native
    "console", "Math", "JSON", "Object", "Array", "Promise", "Date", "String", "Number", "process",
    // Node.js Native
    "fs", "path", "util", "stream", "http", "https", "Buffer", "crypto"
]);

const SKIP_NAMES = new Set([
    // Array/String/Promise Methods
    "map", "filter", "reduce", "push", "pop", "slice", "splice", "split", "replace", "trim", "then", "catch", "finally",
    // Data Accessors / Property-like calls
    "name", "line", "file", "type", "path", "handler", "length", "size", "has", "get", "set", "add", "delete", "clear",
  
]);

// ── 2. STRICT WHITELIST (Allowed 3rd-Party Boundaries) ───────────────────────
const ALLOWED_EXTERNALS = new Set([
    "axios", "fetch", "mongoose", "prisma" 
    // Add more high-level DB/API clients here as needed
]);

class GlobalIndex {
    constructor() {
        this.functions  = new Map(); 
        this.routes     = new Map(); 
        this.files      = new Map(); 
        this.reverseMap = new Map();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. BUILD PHASE
    // ═══════════════════════════════════════════════════════════════════════

    build(repoPath) {
        this.functions.clear();
        this.routes.clear();
        this.files.clear();
        this.reverseMap.clear();

        const allFiles = getAllFiles(repoPath);

        for (const absolutePath of allFiles) {
            const relativePath = path
                .relative(repoPath, absolutePath)
                .split(path.sep).join("/");

            const data = runParser(absolutePath);
            if (!data) continue;

            this.files.set(relativePath, data);

            // index functions
            for (const fn of data.functions) {
                if (!this.functions.has(fn.name)) {
                    this.functions.set(fn.name, []);
                }
                this.functions.get(fn.name).push({
                    name:      fn.name,
                    file:      relativePath,
                    startLine: fn.startLine ?? fn.line,
                    endLine:   fn.endLine   ?? null,
                    type:      fn.type,
                });
            }

            // index routes
            for (const route of data.routes) {
                this.routes.set(route.path, {
                    handler: route.handler,
                    file:    relativePath,
                    method:  route.method,
                });
            }
        }

        // build file-level reverse map
        for (const [relativePath, data] of this.files) {
            for (const call of (data.calls || [])) {
                if (!call.name || !call.from) continue;

                const calleeInfo = this.findFunction(call.name, relativePath);
                const calleeFile = calleeInfo?.file ?? relativePath;
                const calleeKey  = `${calleeFile}::${call.name}`;
                const callerKey  = `${relativePath}::${call.from}`;

                if (!this.reverseMap.has(calleeKey)) {
                    this.reverseMap.set(calleeKey, new Set());
                }
                this.reverseMap.get(calleeKey).add(callerKey);
            }
        }

        console.log(
            `[analyzer] built — files: ${this.files.size}` +
            ` | functions: ${this.functions.size}` +
            ` | routes: ${this.routes.size}`
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. RESOLUTION LAYER
    // ═══════════════════════════════════════════════════════════════════════

    findFunction(name, callerFile = null) {
        const matches = this.functions.get(name);
        if (!matches || matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        if (callerFile) {
            const local = matches.find(m => m.file === callerFile);
            if (local) return local;

            const callerDir = callerFile.split("/").slice(0, -1).join("/");
            const sameDir   = matches.find(m => m.file.startsWith(callerDir));
            if (sameDir) return sameDir;
        }

        console.warn(`[analyzer] ambiguous "${name}" — ${matches.length} matches. Using: ${matches[0].file}`);
        return matches[0];
    }

    findRoute(url) {
        if (!url || url.startsWith("dynamic:")) return null;

        let cleanUrl = url;
        try {
            if (url.startsWith("http")) cleanUrl = new URL(url).pathname;
        } catch (_) {}

        if (this.routes.has(cleanUrl)) return this.routes.get(cleanUrl);

        for (const [routePath, data] of this.routes) {
            const pattern = new RegExp("^" + routePath.replace(/:[^\s/]+/g, "([^/]+)") + "$");
            if (pattern.test(cleanUrl)) return data;
        }

        const parts = cleanUrl.split("/").filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            const trial = "/" + parts.slice(i).join("/");
            if (this.routes.has(trial)) return this.routes.get(trial);
        }

        return null;
    }

    getFileData(relativePath) {
        return this.files.get(relativePath);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. RELATIONSHIP LAYER
    // ═══════════════════════════════════════════════════════════════════════

    getCalls(funcName, fileData) {
        if (!fileData?.calls) return [];
        return fileData.calls.filter(c => c.from === funcName);
    }

    getUsedBy(funcName, funcFile) {
        const key     = `${funcFile}::${funcName}`;
        const callers = this.reverseMap.get(key) || new Set();

        return Array.from(callers).map(callerKey => {
            const [callerFile, callerName] = callerKey.split("::");
            return { callerName, callerFile };
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. TRAVERSAL LAYER
    // ═══════════════════════════════════════════════════════════════════════

    _classifyFile(file) {
        if (!file) return "backend";
        const f = file.toLowerCase();
        if (f.endsWith(".jsx")) return "frontend";
        if (f.includes("frontend") || f.includes("client") || f.includes("ui")) return "frontend";
        if (f.includes("pages") || f.includes("components") || f.includes("views")) return "frontend";
        return "backend";
    }

    /**
     * THE GATEKEEPER: "Unknown = Reject"
     */
    _isRelevantCall(callName, objectName) {
        if (!callName) return false;

        // 1. HARD REJECT: Native objects, built-in methods, and property accessors
        if (SKIP_NAMES.has(callName)) return false;
        if (objectName && SKIP_OBJECTS.has(objectName)) return false;

        // 2. ALLOW: It is a user-defined function in the repository
        if (this.functions.has(callName)) return true;

        // 3. ALLOW: It is a recognized, high-value 3rd-party library
        if (objectName && ALLOWED_EXTERNALS.has(objectName)) return true;
        if (ALLOWED_EXTERNALS.has(callName)) return true; // e.g., direct fetch()

        // 4. IGNORE EVERYTHING ELSE
        return false;
    }

    trace(entryFunction, maxDepth = 8) {
        const flow           = [];
        const nodes          = [];
        const edges          = [];
        const nodeMap        = new Map();
        const fullyProcessed = new Set();
        const flowSet        = new Set();

        const upsertNode = (key, label, file, startLine, endLine, type) => {
            if (nodeMap.has(key)) return nodeMap.get(key);
            const id = `node_${nodes.length}`;
            nodeMap.set(key, id);
            nodes.push({ id, label, file, startLine, endLine, type });
            return id;
        };

        const addEdge = (fromId, toId) => {
            if (!fromId || !toId || fromId === toId) return;
            if (!edges.some(e => e.from === fromId && e.to === toId)) {
                edges.push({ from: fromId, to: toId });
            }
        };

        const pushFlow = (entry) => {
            const dedupeKey = `${entry.type}:${entry.label}:${entry.file}`;
            if (flowSet.has(dedupeKey)) return;
            flowSet.add(dedupeKey);
            flow.push({ ...entry, step: flow.length + 1 });
        };

        const dfs = (funcName, callerFile = null, callerNodeId = null, callStack = new Set(), depth = 0) => {
            if (depth > maxDepth) return;

            const fnInfo = this.findFunction(funcName, callerFile);
            
            // If function is entirely unknown and not in our index, drop it
            if (!fnInfo) return; 
            
            // Prevent analyzer from analyzing itself if pointed at its own repo
           
            const visitKey = `${fnInfo.file}:${funcName}`;
            if (callStack.has(visitKey)) return;

            const nodeType = this._classifyFile(fnInfo.file);
            const nodeId   = upsertNode(visitKey, funcName, fnInfo.file, fnInfo.startLine, fnInfo.endLine, nodeType);
            addEdge(callerNodeId, nodeId);

            pushFlow({
                label:     funcName,
                file:      fnInfo.file,
                startLine: fnInfo.startLine,
                endLine:   fnInfo.endLine,
                type:      "function",
                layer:     nodeType,
            });

            if (fullyProcessed.has(visitKey)) return;
            callStack.add(visitKey);

            const fileData = this.getFileData(fnInfo.file);
            if (fileData) {

                // API calls → bridge to backend
                const apiCalls = (fileData.apiCalls || []).filter(a => a.from === funcName);
                for (const api of apiCalls) {
                    const apiLabel = `${api.method} ${api.url ?? "unknown"}`;
                    const apiId    = upsertNode(`api:${apiLabel}`, apiLabel, fnInfo.file, api.line, null, "api");
                    addEdge(nodeId, apiId);
                    pushFlow({ label: apiLabel, file: fnInfo.file, startLine: api.line, endLine: null, type: "api" });

                    const route = this.findRoute(api.url);
                    if (route?.handler) {
                        dfs(route.handler, fnInfo.file, apiId, new Set(callStack), depth + 1);
                    }
                }

                // Function calls
                const allCalls = this.getCalls(funcName, fileData);
                for (const call of allCalls) {
                    
                    // GATEKEEPER: "Unknown = Reject"
                    if (!this._isRelevantCall(call.name, call.object)) continue;

                    if (call.object) {
                        const resolved = this.findFunction(call.name, fnInfo.file);
                        if (resolved) {
                            dfs(call.name, fnInfo.file, nodeId, new Set(callStack), depth + 1);
                        } else {
                            // Valid 3rd-party library call (survived relevance check whitelist)
                            const label = `${call.object}.${call.name}()`;
                            const extId = upsertNode(`ext:${label}`, label, fnInfo.file, call.line, null, "external");
                            addEdge(nodeId, extId);
                            pushFlow({ label, file: fnInfo.file, startLine: call.line, endLine: null, type: "external" });
                        }
                        continue;
                    }

                    if (this.functions.has(call.name)) {
                        dfs(call.name, fnInfo.file, nodeId, new Set(callStack), depth + 1);
                    } else {
                        // Global whitelist function (like fetch)
                        const label = `${call.name}()`;
                        const extId = upsertNode(`ext:${label}`, label, fnInfo.file, call.line, null, "external");
                        addEdge(nodeId, extId);
                        pushFlow({ label, file: fnInfo.file, startLine: call.line, endLine: null, type: "external" });
                    }
                }

                // Events that trigger this function
                for (const evt of (fileData.events || [])) {
                    const triggers = evt.handler === funcName || (evt.callsInside || []).includes(funcName);
                    if (!triggers) continue;

                    const label = `${evt.event} on <${evt.element}>`;
                    const eId   = upsertNode(`evt:${fnInfo.file}:${evt.line}`, label, fnInfo.file, evt.line, null, "event");
                    addEdge(eId, nodeId);
                    pushFlow({ label, file: fnInfo.file, startLine: evt.line, endLine: null, type: "event" });
                }

                // Routes that map to this function
                for (const [routePath, routeData] of this.routes) {
                    if (routeData.handler !== funcName) continue;
                    const rLabel = `${routeData.method} ${routePath}`;
                    const rId    = upsertNode(`route:${rLabel}`, rLabel, routeData.file, null, null, "route");
                    addEdge(rId, nodeId);
                    pushFlow({ label: rLabel, file: routeData.file, startLine: null, endLine: null, type: "route" });
                }
            }

            callStack.delete(visitKey);
            fullyProcessed.add(visitKey);
        };

        dfs(entryFunction);

        const filtered = this._filterOutput(flow);

        return {
            flow:      filtered,
            fullGraph: { nodes, edges },
            stats:     this._buildStats(filtered),
            meta:      { maxDepth, direction: "forward" },
        };
    }

    traceBackward(funcName, maxDepth = 4) {
        const fnInfo = this.findFunction(funcName);
        if (!fnInfo) return { error: `Function "${funcName}" not found.` };

        const flow    = [];
        const nodes   = [];
        const edges   = [];
        const nodeMap = new Map();
        const visited = new Set();
        const flowSet = new Set();

        const upsertNode = (key, label, file, startLine, endLine, type) => {
            if (nodeMap.has(key)) return nodeMap.get(key);
            const id = `node_${nodes.length}`;
            nodeMap.set(key, id);
            nodes.push({ id, label, file, startLine, endLine, type });
            return id;
        };

        const addEdge = (fromId, toId) => {
            if (!fromId || !toId || fromId === toId) return;
            if (!edges.some(e => e.from === fromId && e.to === toId)) {
                edges.push({ from: fromId, to: toId });
            }
        };

        const pushFlow = (entry) => {
            const dedupeKey = `${entry.type}:${entry.label}:${entry.file}`;
            if (flowSet.has(dedupeKey)) return;
            flowSet.add(dedupeKey);
            flow.push({ ...entry, step: flow.length + 1 });
        };

        const targetId = upsertNode(
            `${fnInfo.file}:${funcName}`,
            funcName,
            fnInfo.file,
            fnInfo.startLine,
            fnInfo.endLine,
            this._classifyFile(fnInfo.file)
        );

        const queue = [{ funcName, funcFile: fnInfo.file, nodeId: targetId, depth: 0 }];

        while (queue.length > 0) {
            const { funcName: current, funcFile: currentFile, nodeId: currentNodeId, depth } = queue.shift();
            const visitKey = `${currentFile}::${current}`;

            if (visited.has(visitKey)) continue;
            visited.add(visitKey);

            if (depth >= maxDepth) continue;

            const callers = this.getUsedBy(current, currentFile);

            for (const { callerName, callerFile } of callers) {
                
                // BACKWARD GATEKEEPER: "Unknown = Reject" applies in reverse too
                if (!this._isRelevantCall(callerName, null)) continue;
                if (callerFile.includes("analyzer.service.js")) continue;

                const callerInfo = this.findFunction(callerName, callerFile);
                const callerKey  = `${callerFile}::${callerName}`;

                const callerId = upsertNode(
                    callerKey,
                    callerName,
                    callerFile,
                    callerInfo?.startLine ?? null,
                    callerInfo?.endLine   ?? null,
                    this._classifyFile(callerFile)
                );

                addEdge(callerId, currentNodeId);

                pushFlow({
                    label:     callerName,
                    calls:     current,
                    file:      callerFile,
                    startLine: callerInfo?.startLine ?? null,
                    endLine:   callerInfo?.endLine   ?? null,
                    type:      "function",
                    layer:     this._classifyFile(callerFile),
                });

                queue.push({
                    funcName:  callerName,
                    funcFile:  callerFile,
                    nodeId:    callerId,
                    depth:     depth + 1,
                });
            }

            const fileData = this.getFileData(currentFile);
            if (fileData) {
                for (const evt of (fileData.events || [])) {
                    const triggers = evt.handler === current || (evt.callsInside || []).includes(current);
                    if (!triggers) continue;

                    const label  = `${evt.event} on <${evt.element}>`;
                    const eId    = upsertNode(`evt:${currentFile}:${evt.line}`, label, currentFile, evt.line, null, "event");
                    addEdge(eId, currentNodeId);
                    pushFlow({ label, file: currentFile, startLine: evt.line, endLine: null, type: "event", calls: current });
                }
            }
        }

        return {
            target:    funcName,
            flow,
            fullGraph: { nodes, edges },
            stats: {
                totalCallers: flow.filter(f => f.type === "function").length,
                uniqueFiles:  new Set(flow.map(f => f.file).filter(Boolean)).size,
                events:       flow.filter(f => f.type === "event").length,
            },
            meta: { maxDepth, direction: "backward" },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. FILTERING LAYER
    // ═══════════════════════════════════════════════════════════════════════

    _filterOutput(flow) {
        return flow.filter(step => {
            if (["api", "route", "event", "external"].includes(step.type)) return true;

            const name = step.label?.replace("()", "").split(".").pop();
            if (SKIP_NAMES.has(name)) return false;

            const obj = step.label?.split(".")[0];
            if (SKIP_OBJECTS.has(obj)) return false;

            return true;
        });
    }

    _buildStats(flow) {
        return {
            steps:       flow.length,
            uniqueFiles: new Set(flow.map(f => f.file).filter(Boolean)).size,
            functions:   flow.filter(f => f.type === "function").length,
            apiCalls:    flow.filter(f => f.type === "api").length,
            external:    flow.filter(f => f.type === "external").length,
            events:      flow.filter(f => f.type === "event").length,
            routes:      flow.filter(f => f.type === "route").length,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════

    analyzeFunction(name, direction = "forward", maxDepth = null) {
        const fnInfo = this.findFunction(name);
        if (!fnInfo) {
            return { error: `Function "${name}" not found in index.` };
        }

        if (direction === "backward") {
            const depth = maxDepth ?? 4;
            return this.traceBackward(name, depth);
        }

        const depth = maxDepth ?? 8;
        return this.trace(name, depth);
    }
}

module.exports = new GlobalIndex();
