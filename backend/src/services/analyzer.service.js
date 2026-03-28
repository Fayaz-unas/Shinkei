const path           = require("path");
const { getAllFiles } = require("../utils/fileWalker");
const { runParser }  = require("../parser/engine/parserEngine");

class GlobalIndex {
    constructor() {
        this.functions = new Map(); // funcName → [{name, file, line, type}]
        this.routes    = new Map(); // routePath → {handler, file, method}
        this.files     = new Map(); // relativePath → parsedData
    }

    // ── BUILD ──────────────────────────────────────────────────────────────

    build(repoPath) {
        this.functions.clear();
        this.routes.clear();
        this.files.clear();

        const allFiles = getAllFiles(repoPath);

        for (const absolutePath of allFiles) {
            const relativePath = path
                .relative(repoPath, absolutePath)
                .split(path.sep).join("/");

            const data = runParser(absolutePath);
            if (!data) continue;

            this.files.set(relativePath, data);

            // index all functions
            for (const fn of data.functions) {
                if (!this.functions.has(fn.name)) {
                    this.functions.set(fn.name, []);
                }
                this.functions.get(fn.name).push({
                    name: fn.name,
                    file: relativePath,
                    line: fn.line,
                    type: fn.type,
                });
            }

            // index all routes
            for (const route of data.routes) {
                this.routes.set(route.path, {
                    handler: route.handler,
                    file:    relativePath,
                    method:  route.method,
                });
            }
        }

        console.log(
            `[globalIndex] built — files: ${this.files.size}` +
            ` | functions: ${this.functions.size}` +
            ` | routes: ${this.routes.size}`
        );
    }

    // ── LOOKUP ─────────────────────────────────────────────────────────────

    findFunction(name, callerFile = null) {
        const matches = this.functions.get(name);
        if (!matches || matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        // collision: prefer same file first
        if (callerFile) {
            const local = matches.find(m => m.file === callerFile);
            if (local) return local;
        }
        return matches[0];
    }

findRoute(url) {
        if (!url) return null;

        // 1. Strip Protocol/Host
        let cleanUrl = url;
        try {
            if (url.startsWith('http')) {
                cleanUrl = new URL(url).pathname;
            }
        } catch (e) { /* Keep as is */ }

        // 2. Exact Match
        if (this.routes.has(cleanUrl)) {
            console.log(`✅ [bridge] Match: ${cleanUrl}`);
            return this.routes.get(cleanUrl);
        }

        // 3. Express Regex Params (:id)
        for (const [routePath, data] of this.routes) {
            const pattern = new RegExp("^" + routePath.replace(/:[^\s/]+/g, "([^/]+)") + "$");
            if (pattern.test(cleanUrl)) return data;
        }

        // 4. Suffix/Deep Match (Handles /api/lore matching /lore)
        const parts = cleanUrl.split('/').filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            const trialPath = '/' + parts.slice(i).join('/');
            if (this.routes.has(trialPath)) {
                console.log(`✅ [bridge] Suffix Match: ${cleanUrl} -> ${trialPath}`);
                return this.routes.get(trialPath);
            }
        }

        console.warn(`❌ [bridge] No route for: "${cleanUrl}"`);
        return null;
    }

    getFileData(relativePath) {
        return this.files.get(relativePath);
    }
    // ── TRACE ──────────────────────────────────────────────────────────────

 trace(entryFunction) {
        const self = this; // Capture context for nested helpers
        const flow = [];
        const nodes = [];
        const edges = [];
        const nodeMap = new Map();
        const fullyProcessed = new Set();

        const classifyFile = (file) => {
            if (!file) return "backend";
            const f = file.toLowerCase();
            if (f.endsWith(".jsx") || f.endsWith(".tsx")) return "frontend";
            if (f.includes("frontend") || f.includes("client") || f.includes("ui")) return "frontend";
            return "backend";
        };

        const upsertNode = (key, label, file, line, type) => {
            if (nodeMap.has(key)) return nodeMap.get(key);
            const id = `node_${nodes.length}`;
            nodeMap.set(key, id);
            nodes.push({ id, label, file, line, type });
            return id;
        };

        const addEdge = (fromId, toId) => {
            if (!fromId || !toId || fromId === toId) return;
            if (!edges.some(e => e.from === fromId && e.to === toId)) {
                edges.push({ from: fromId, to: toId });
            }
        };

        const resolveCalls = (fileData, funcName) => {
            if (!fileData?.calls) return [];
            return fileData.calls.filter(c => {
                if (c.from !== funcName) return false;
                const SKIP_OBJECTS = new Set(["console", "Math", "JSON", "Object", "Array", "Promise", "Date", "String", "Number", "process"]);
                if (c.object && SKIP_OBJECTS.has(c.object)) return false;
                const SKIP_NAMES = new Set(["log", "warn", "error", "info", "debug", "then", "catch", "finally", "toString", "valueOf", "forEach", "map", "filter", "reduce", "find", "push", "pop", "shift", "unshift", "slice", "splice", "trim", "split", "replace", "includes", "startsWith", "endsWith", "keys", "values", "entries", "assign", "create", "listen", "pipe", "on", "emit", "use"]);
                if (!c.object && SKIP_NAMES.has(c.name)) return false;
                return true;
            });
        };

        const dfs = (funcName, callerFile = null, callerNodeId = null, callStack = new Set()) => {
            // Use self instead of this
            const fnInfo = self.findFunction(funcName, callerFile);
            if (!fnInfo) {
        console.log(`⚠️ [trace] Could not find function: "${funcName}" (called from ${callerFile || "entry"})`);
        return;
    }

            const visitKey = `${fnInfo.file}:${funcName}`;
            if (callStack.has(visitKey)) return;

            const nodeId = upsertNode(visitKey, funcName, fnInfo.file, fnInfo.line, classifyFile(fnInfo.file));
            addEdge(callerNodeId, nodeId);

            flow.push({
                step: flow.length + 1,
                label: funcName,
                file: fnInfo.file,
                line: fnInfo.line,
                type: "function",
            });

            if (fullyProcessed.has(visitKey)) return;
            callStack.add(visitKey);

            const fileData = self.getFileData(fnInfo.file);
            if (fileData) {
                // 1. API Calls (The Bridge)
                const apiCalls = (fileData.apiCalls || []).filter(a => a.from === funcName);
                for (const api of apiCalls) {
                    const apiLabel = `${api.method} ${api.url ?? "unknown"}`;
                    const apiNodeId = upsertNode(`api:${apiLabel}`, apiLabel, fnInfo.file, api.line, "api");
                    addEdge(nodeId, apiNodeId);
                    
                    flow.push({ step: flow.length + 1, label: apiLabel, file: fnInfo.file, line: api.line, type: "api" });

                    const route = self.findRoute(api.url);
                    if (route?.handler) {
                        dfs(route.handler, fnInfo.file, apiNodeId, new Set(callStack));
                    }
                }

                // 2. Member/Direct Calls
                const allCalls = resolveCalls(fileData, funcName);
                for (const call of allCalls) {
                    if (call.object) {
                        const memberInfo = self.findFunction(call.name, fnInfo.file);
                        if (memberInfo) {
                            dfs(call.name, fnInfo.file, nodeId, new Set(callStack));
                        } else {
                            const label = `${call.object}.${call.name}()`;
                            const mNodeId = upsertNode(`m:${fnInfo.file}:${label}`, label, fnInfo.file, call.line, "member");
                            addEdge(nodeId, mNodeId);
                            flow.push({ step: flow.length + 1, label, file: fnInfo.file, line: call.line, type: "member" });
                        }
                    } else if (self.functions.has(call.name)) {
                        dfs(call.name, fnInfo.file, nodeId, new Set(callStack));
                    }
                }

                // 3. Events & 4. Routes
                (fileData.events || []).forEach(evt => {
                    if (evt.handler === funcName || (evt.callsInside || []).includes(funcName)) {
                        const label = `${evt.event} on <${evt.element}>`;
                        const eNodeId = upsertNode(`evt:${fnInfo.file}:${label}:${evt.line}`, label, fnInfo.file, evt.line, "event");
                        addEdge(nodeId, eNodeId);
                        flow.push({ step: flow.length + 1, label, file: fnInfo.file, line: evt.line, type: "event" });
                    }
                });

                for (const [routePath, routeData] of self.routes) {
                    if (routeData.handler === funcName) {
                        const rLabel = `${routeData.method} ${routePath}`;
                        const rNodeId = upsertNode(`route:${rLabel}`, rLabel, routeData.file, null, "route");
                        addEdge(rNodeId, nodeId);
                        flow.push({ step: flow.length + 1, label: rLabel, file: routeData.file, line: null, type: "route" });
                    }
                }
            }

            callStack.delete(visitKey);
            fullyProcessed.add(visitKey);
        };

        dfs(entryFunction);

        return {
            flow,
            fullGraph: { nodes, edges },
            stats: {
                steps: flow.length,
                uniqueFiles: new Set(flow.map(f => f.file).filter(Boolean)).size,
                functions: flow.filter(f => f.type === "function").length,
                apiCalls: flow.filter(f => f.type === "api").length,
                memberCalls: flow.filter(f => f.type === "member").length,
                events: flow.filter(f => f.type === "event").length,
                routes: flow.filter(f => f.type === "route").length,
            },
        };
    }
}

module.exports = new GlobalIndex();
