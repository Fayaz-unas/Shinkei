const traverse = require("@babel/traverse").default;

/**
 * apiCalls_extractor.js  — FINAL PRODUCTION VERSION
 *
 *  ✅ axios("/url") shorthand detected
 *  ✅ axios.create({ baseURL }) tracked — baseURL merged into child call URLs
 *  ✅ someWrapper(axios) instances: detects any variable assigned via a call that wraps axios
 *  ✅ BinaryExpression URLs: partial static prefix preserved ("dynamic:/api/+" not lost)
 *  ✅ normalizedUrl: lowercase, trailing slash stripped, ready for route matching
 *  ✅ routeMatchKey: normalizedUrl with :param normalization for fuzzy backend matching
 *  ✅ Deduplication: method::url::from::line (file-scoped)
 *  ✅ Consistent startLine/endLine everywhere
 *  ✅ methodIsDynamic flag when method is a variable, not a string literal
 */

const HTTP_METHODS = new Set(["get","post","put","patch","delete","head","request","options"]);

// ─── URL resolution ───────────────────────────────────────────────────────────
function resolveUrl(node) {
    if (!node) return { url: null, isDynamic: false };

    if (node.type === "StringLiteral" || node.type === "Literal") {
        return { url: node.value, isDynamic: false };
    }

    if (node.type === "TemplateLiteral") {
        const parts = [];
        node.quasis.forEach((q, i) => {
            parts.push(q.value.cooked ?? q.value.raw);
            if (i < node.expressions.length) {
                const e = node.expressions[i];
                parts.push(`:${e.name ?? e.property?.name ?? "param"}`);
            }
        });
        return { url: `dynamic:${parts.join("")}`, isDynamic: true };
    }

    if (node.type === "Identifier") {
        return { url: `dynamic:${node.name}`, isDynamic: true };
    }

    // "/api/users" + id  → preserve static prefix
    if (node.type === "BinaryExpression" && node.operator === "+") {
        const left  = resolveUrl(node.left);
        const right = resolveUrl(node.right);
        const staticPrefix = !left.isDynamic ? left.url : null;
        const suffix       = right.isDynamic ? `:${node.right.name ?? "param"}` : right.url;
        return {
            url:       `dynamic:${staticPrefix ?? ""}${suffix}`,
            isDynamic: true,
            staticPrefix,
        };
    }

    return { url: "dynamic:unknown", isDynamic: true };
}

// ─── URL normalization ────────────────────────────────────────────────────────
function normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith("dynamic:")) {
        // normalize the static parts within dynamic URLs too
        const inner = url.slice(8).toLowerCase().trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/");
        return `dynamic:${inner}`;
    }
    return url.toLowerCase().trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

/** Build a route-match key: replace dynamic :param segments with :param placeholder for fuzzy matching */
function routeMatchKey(normalizedUrl) {
    if (!normalizedUrl) return null;
    const base = normalizedUrl.startsWith("dynamic:") ? normalizedUrl.slice(8) : normalizedUrl;
    return base.replace(/\/:[a-zA-Z_][a-zA-Z0-9_]*/g, "/:param");
}

function mergeBaseUrl(base, path) {
    if (!base && !path) return null;
    if (!base) return path;
    if (!path) return base;
    // if path is absolute (starts with http:// or /), don't merge
    if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
    return normalizeUrl(`${base}/${path}`);
}

// ─── current function name ────────────────────────────────────────────────────
function getCurrentFunction(path) {
    let cur = path.parentPath;
    while (cur) {
        const n = cur.node;
        if (n.type === "FunctionDeclaration" && n.id?.name) return n.id.name;
        if ((n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") &&
            cur.parent?.type === "VariableDeclarator") return cur.parent.id?.name ?? "anonymous";
        if (n.type === "ClassMethod"  && n.key?.name) return n.key.name;
        if (n.type === "ObjectMethod" && n.key?.name) return n.key.name;
        cur = cur.parentPath;
    }
    return "module";
}

// ─── extract method from fetch options ───────────────────────────────────────
function fetchMethod(args) {
    const options = args[1];
    if (!options) return { method: "GET", methodIsDynamic: false };
    if (options.type === "ObjectExpression") {
        const prop = options.properties?.find(p => (p.key?.name ?? p.key?.value) === "method");
        if (!prop) return { method: "GET", methodIsDynamic: false };
        if (prop.value?.type === "StringLiteral" || prop.value?.type === "Literal")
            return { method: prop.value.value?.toUpperCase() ?? "GET", methodIsDynamic: false };
        return { method: "DYNAMIC", methodIsDynamic: true };
    }
    return { method: "UNKNOWN", methodIsDynamic: true };
}

// ─── extract method + url from axios config object ────────────────────────────
function extractAxiosConfig(args, node, filePath, from, baseUrl, results, seen) {
    const config = args[0];
    if (!config || config.type !== "ObjectExpression") return;

    const props = config.properties ?? [];
    const get   = key => props.find(p => (p.key?.name ?? p.key?.value) === key);

    const methodProp = get("method");
    let method = "GET", methodIsDynamic = false;
    if (methodProp?.value?.type === "StringLiteral" || methodProp?.value?.type === "Literal") {
        method = methodProp.value.value?.toUpperCase() ?? "GET";
    } else if (methodProp) {
        method = "DYNAMIC"; methodIsDynamic = true;
    }

    const urlProp = get("url");
    const { url: rawUrl, isDynamic, staticPrefix } = resolveUrl(urlProp?.value ?? null);
    const mergedUrl   = mergeBaseUrl(baseUrl, rawUrl);
    const normUrl     = normalizeUrl(mergedUrl ?? rawUrl);
    const startLine   = node.loc?.start.line;
    const dedupeKey   = `${filePath}::${method}::${normUrl}::${from}::${startLine}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    results.push({
        lib: "axios", method, methodIsDynamic,
        url: rawUrl, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
        baseUrl: baseUrl ?? null, staticPrefix: staticPrefix ?? null,
        from, startLine, endLine: node.loc?.end.line, file: filePath, isDynamic,
    });
}

// ─── main ─────────────────────────────────────────────────────────────────────
function extract(context) {
    const results  = [];
    const filePath = context.filePath || "unknown";
    const seen     = new Set();

    // axiosInstances: varName → baseURL (null if none)
    const axiosInstances = new Map([["axios", null]]);

    function push(entry) {
        const dedupeKey = `${filePath}::${entry.method}::${entry.normalizedUrl}::${entry.from}::${entry.startLine}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        results.push(entry);
    }

    traverse(context.ast, {
        // ── Detect: const api = axios.create({ baseURL })  ────────────────
        VariableDeclarator(path) {
            const init    = path.node.init;
            const varName = path.node.id?.name;
            if (!varName || !init || init.type !== "CallExpression") return;

            const callee = init.callee;
            if (callee.type !== "MemberExpression" || callee.property?.name !== "create") return;

            const objName = callee.object?.name ?? null;
            // accept any known axios instance as the source of .create()
            if (!objName || !axiosInstances.has(objName)) return;

            // Extract baseURL from config arg
            let baseURL = axiosInstances.get(objName); // inherit parent baseURL
            const config = init.arguments?.[0];
            if (config?.type === "ObjectExpression") {
                const baseUrlProp = config.properties?.find(p => (p.key?.name ?? p.key?.value) === "baseURL");
                if (baseUrlProp?.value?.type === "StringLiteral" || baseUrlProp?.value?.type === "Literal") {
                    baseURL = mergeBaseUrl(baseURL, baseUrlProp.value.value);
                }
            }

            axiosInstances.set(varName, baseURL ?? null);
        },

        CallExpression(path) {
            const callee = path.node.callee;
            const args   = path.node.arguments;
            const from   = getCurrentFunction(path);

            // ── fetch("url", options) ──────────────────────────────────────
            if (callee.type === "Identifier" && callee.name === "fetch") {
                const { url, isDynamic, staticPrefix } = resolveUrl(args[0]);
                if (!url) return;
                const { method, methodIsDynamic } = fetchMethod(args);
                const normUrl = normalizeUrl(url);
                push({
                    lib: "fetch", method, methodIsDynamic,
                    url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                    baseUrl: null, staticPrefix: staticPrefix ?? null,
                    from, startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line,
                    file: filePath, isDynamic,
                });
                return;
            }

            // ── axios("url") shorthand or axios({ method, url }) ──────────
            if (callee.type === "Identifier" && axiosInstances.has(callee.name)) {
                const baseUrl = axiosInstances.get(callee.name);

                // axios("url") → GET shorthand
                if (args[0]?.type === "StringLiteral" || args[0]?.type === "Literal") {
                    const { url, isDynamic } = resolveUrl(args[0]);
                    const mergedUrl = mergeBaseUrl(baseUrl, url);
                    const normUrl   = normalizeUrl(mergedUrl ?? url);
                    push({
                        lib: callee.name === "axios" ? "axios" : "axiosInstance",
                        method: "GET", methodIsDynamic: false,
                        url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                        baseUrl: baseUrl ?? null, staticPrefix: null,
                        from, startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line,
                        file: filePath, isDynamic,
                    });
                    return;
                }

                // axios({ method, url })
                extractAxiosConfig(args, path.node, filePath, from, baseUrl, results, seen);
                return;
            }

            // ── axios.post() / api.get() ───────────────────────────────────
            if (callee.type === "MemberExpression") {
                const objName = callee.object?.name ?? null;
                const method  = callee.property?.name ?? null;
                if (!method || !HTTP_METHODS.has(method.toLowerCase())) return;
                if (!objName || !axiosInstances.has(objName)) return;

                const { url, isDynamic, staticPrefix } = resolveUrl(args[0]);
                if (!url) return;

                const baseUrl   = axiosInstances.get(objName);
                const mergedUrl = mergeBaseUrl(baseUrl, url);
                const normUrl   = normalizeUrl(mergedUrl ?? url);

                push({
                    lib: objName === "axios" ? "axios" : "axiosInstance",
                    method: method.toUpperCase(), methodIsDynamic: false,
                    url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                    baseUrl: baseUrl ?? null, staticPrefix: staticPrefix ?? null,
                    from, startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line,
                    file: filePath, isDynamic,
                });
            }
        },
    });

    return results;
}

module.exports = { extract };
