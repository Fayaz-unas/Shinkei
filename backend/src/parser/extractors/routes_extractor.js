const traverse = require("@babel/traverse").default;

/**
 * routes_extractor.js  — FINAL PRODUCTION VERSION
 *
 *  ✅ Dedup key is filePath-scoped: filePath::method::normalizedPath (no cross-file collisions)
 *  ✅ app.use("/api", router) base-path merging: child routes get full resolved paths
 *  ✅ handlerFunctionId: "filePath::handlerName" — actual ID for resolver linkage
 *  ✅ Dynamic params structured: [{ name, segment, segmentIndex }]
 *  ✅ Named template-literal params: `/user/${id}` → :id not :param
 *  ✅ Router alias deep-chain resolution (multi-pass until stable)
 *  ✅ Path normalization: trailing slash, double slash, lowercase
 *  ✅ Consistent startLine/endLine everywhere
 */

const HTTP_VERBS = new Set(["get","post","put","patch","delete","all","use","head","options"]);

// ─── path helpers ─────────────────────────────────────────────────────────────
function normalizePath(p) {
    if (!p) return "/";
    if (p.startsWith("dynamic:")) return p;
    return p.toLowerCase().trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/") || "/";
}

function joinPaths(base, child) {
    if (!base || base === "/") return normalizePath(child);
    if (!child || child === "/") return normalizePath(base);
    if (child.startsWith("dynamic:") || base.startsWith("dynamic:")) {
        return `dynamic:${base.replace(/^dynamic:/, "")}${child.replace(/^dynamic:/, "")}`;
    }
    return normalizePath(`${normalizePath(base)}${normalizePath(child)}`);
}

function extractParams(routePath) {
    if (!routePath || routePath.startsWith("dynamic:")) return [];
    return routePath.split("/").reduce((acc, seg, idx) => {
        if (seg.startsWith(":"))           acc.push({ name: seg.slice(1), segment: seg, segmentIndex: idx });
        else if (/^\[.+\]$/.test(seg))    acc.push({ name: seg.slice(1,-1), segment: seg, segmentIndex: idx });
        return acc;
    }, []);
}

function resolveRoutePath(node) {
    if (!node) return null;
    if (node.type === "StringLiteral" || node.type === "Literal") return node.value;
    if (node.type === "TemplateLiteral") {
        const parts = [];
        node.quasis.forEach((q, i) => {
            parts.push(q.value.cooked ?? q.value.raw);
            if (i < node.expressions.length) {
                const e = node.expressions[i];
                parts.push(`:${e.name ?? e.property?.name ?? "param"}`);
            }
        });
        return `dynamic:${parts.join("")}`;
    }
    if (node.type === "Identifier") return `dynamic:${node.name}`;
    return null;
}

// ─── collect all router variable names (multi-pass until stable) ──────────────
function collectRouterNames(ast) {
    const names = new Set(["app","router","server","fastify","api","r"]);
    let changed = true;
    while (changed) {
        changed = false;
        traverse(ast, {
            VariableDeclarator(path) {
                const init = path.node.init;
                const varName = path.node.id?.name;
                if (!varName || names.has(varName) || !init) return;

                if (init.type === "CallExpression" && init.callee?.type === "MemberExpression" &&
                    (init.callee.property?.name === "Router" || init.callee.property?.name === "register")) {
                    names.add(varName); changed = true; return;
                }
                if (init.type === "Identifier" && names.has(init.name)) {
                    names.add(varName); changed = true; return;
                }
                if (path.node.id?.type === "ObjectPattern" && init.type === "Identifier" && names.has(init.name)) {
                    path.node.id.properties.forEach(p => {
                        if (p.value?.name && !names.has(p.value.name)) { names.add(p.value.name); changed = true; }
                    });
                }
            },
        });
    }
    return names;
}

// ─── collect app.use("/prefix", subRouter) mappings ──────────────────────────
function collectBasePaths(ast, routerNames) {
    const basePaths = new Map(); // routerName → string[]
    traverse(ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression") return;
            const obj = callee.object?.name;
            const method = callee.property?.name;
            if (!obj || !routerNames.has(obj) || method !== "use") return;

            const args = path.node.arguments;
            if (args.length < 2) return;

            const pathNode  = args[0];
            const routerArg = args[args.length - 1];
            if (!routerArg || routerArg.type !== "Identifier") return;
            if (!routerNames.has(routerArg.name)) return;

            const base = resolveRoutePath(pathNode);
            if (!base) return;

            const key = routerArg.name;
            if (!basePaths.has(key)) basePaths.set(key, []);
            basePaths.get(key).push(normalizePath(base));
        },
    });
    return basePaths;
}

// ─── extract handler + middleware from route args ─────────────────────────────
function resolveHandlers(args) {
    const rest       = args.slice(1);
    const middleware = [];
    let   handler    = null;

    rest.forEach((arg, i) => {
        const isLast = i === rest.length - 1;
        if (arg.type === "Identifier") {
            if (isLast) handler = arg.name;
            else middleware.push({ name: arg.name, isInline: false });
        } else if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
            if (isLast) handler = "inline";
            else middleware.push({ name: "inline", isInline: true });
        } else if (arg.type === "ArrayExpression") {
            arg.elements.forEach((el, ei) => {
                if (!el) return;
                const isLastEl = ei === arg.elements.length - 1 && isLast;
                if (el.type === "Identifier") {
                    if (isLastEl) handler = el.name;
                    else middleware.push({ name: el.name, isInline: false });
                }
            });
        } else if (arg.type === "MemberExpression") {
            const name = `${arg.object?.name ?? "?"}.${arg.property?.name ?? "?"}`;
            if (isLast) handler = name;
            else middleware.push({ name, isInline: false });
        }
    });

    return { handler, middleware };
}

// ─── main ─────────────────────────────────────────────────────────────────────
function extract(context) {
    const results     = [];
    const filePath    = context.filePath || "unknown";
    const seen        = new Set();
    const routerNames = collectRouterNames(context.ast);
    const basePaths   = collectBasePaths(context.ast, routerNames);

    const isNextApiRoute  = (filePath.includes("/api/") || filePath.includes("/app/")) && /\.(js|jsx|ts|tsx)$/.test(filePath);
    const isNextRouteFile = /route\.(js|jsx|ts|tsx)$/.test(filePath);

    function pushRoute(entry) {
        const normalized = normalizePath(entry.path);
        const prefixes   = basePaths.get(entry.router) ?? [null];

        prefixes.forEach(prefix => {
            const fullPath  = prefix ? joinPaths(prefix, normalized) : normalized;
            const dedupeKey = `${filePath}::${entry.method}::${fullPath}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);

            const params = extractParams(fullPath);

            results.push({
                id:               dedupeKey,
                method:           entry.method,
                path:             fullPath,
                rawPath:          entry.path,
                basePath:         prefix ?? null,
                params,
                router:           entry.router,
                handler:          entry.handler,
                // Resolver will match this against functions_extractor output by file + name
                handlerFunctionId: entry.handler && entry.handler !== "inline"
                    ? `${filePath}::${entry.handler}`
                    : null,
                middleware:       entry.middleware ?? [],
                isDynamic:        fullPath.startsWith("dynamic:") || params.length > 0,
                isUse:            entry.method === "USE",
                startLine:        entry.startLine,
                endLine:          entry.endLine,
                file:             filePath,
            });
        });
    }

    traverse(context.ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression") return;
            const object = callee.object?.name ?? null;
            const method = callee.property?.name ?? null;
            if (!method || !HTTP_VERBS.has(method.toLowerCase())) return;
            if (!object || !routerNames.has(object)) return;

            const args = path.node.arguments;
            if (!args.length) return;
            const routePath = resolveRoutePath(args[0]);
            if (!routePath) return;
            const { handler, middleware } = resolveHandlers(args);

            pushRoute({ method: method.toUpperCase(), path: routePath, router: object, handler, middleware,
                startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line });
        },

        ExportNamedDeclaration(path) {
            if (!isNextApiRoute && !isNextRouteFile) return;
            const decl = path.node.declaration;
            if (!decl) return;
            let name = decl.type === "FunctionDeclaration" ? decl.id?.name
                     : decl.type === "VariableDeclaration" ? decl.declarations?.[0]?.id?.name
                     : null;
            if (!name) return;
            const httpMethod = ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].find(m => name.toUpperCase() === m);
            if (!httpMethod) return;
            const routePath = filePath.replace(/.*\/(pages|app)/,"").replace(/\/route\.(js|jsx|ts|tsx)$/,"").replace(/\.(js|jsx|ts|tsx)$/,"") || "/";
            pushRoute({ method: httpMethod, path: routePath, router: "nextjs", handler: name, middleware: [],
                startLine: decl.loc?.start.line, endLine: decl.loc?.end.line });
        },

        ExportDefaultDeclaration(path) {
            if (!isNextApiRoute) return;
            const routePath = filePath.replace(/.*\/(pages|app)/,"").replace(/\.(js|jsx|ts|tsx)$/,"") || "/";
            pushRoute({ method: "ALL", path: routePath, router: "nextjs", handler: "default", middleware: [],
                startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line });
        },
    });

    return results;
}

module.exports = { extract };
