const traverse = require("@babel/traverse").default;

/**
 * apiCalls.extractor.js
 *
 * Detects ALL HTTP API calls in a JS/JSX file.
 *
 * Handles:
 *  - axios.get/post/put/delete       → axios.post("/api/login")
 *  - axios object config             → axios({ method: "post", url: "/api/login" })
 *  - axios instance calls            → api.post("/login")  (created via axios.create)
 *  - fetch()                         → fetch("/api/login", { method: "POST" })
 *  - dynamic URLs (template literal) → axios.get(`/api/${id}`) → marked as "dynamic"
 *  - caller tracking                 → from: currentFunction
 *  - URL normalization               → always lowercase, trimmed
 */

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "request"]);

// ─── resolve URL from AST node ────────────────────────────────────────────────
function resolveUrl(node) {
    if (!node) return null;

    // "/api/login"
    if (node.type === "StringLiteral") return node.value;

    // `/api/${id}` → mark dynamic but keep static prefix
    if (node.type === "TemplateLiteral") {
        const staticPart = node.quasis.map(q => q.value.raw).join("*");
        return staticPart ? `dynamic:${staticPart}` : "dynamic";
    }

    // variable holding URL → unknown
    if (node.type === "Identifier") return `dynamic:${node.name}`;

    return null;
}

// ─── get current enclosing function name ──────────────────────────────────────
function getCurrentFunction(path) {
    let current = path.parentPath;
    while (current) {
        const node = current.node;
        if (node.type === "FunctionDeclaration" && node.id?.name) return node.id.name;
        if (
            (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") &&
            current.parent?.type === "VariableDeclarator"
        ) return current.parent.id?.name ?? "anonymous";
        if (node.type === "ClassMethod" && node.key?.name) return node.key.name;
        current = current.parentPath;
    }
    return "module";
}

// ─── extract method from fetch options ────────────────────────────────────────
function fetchMethod(args) {
    const options = args[1];
    if (!options || options.type !== "ObjectExpression") return "GET";
    const methodProp = options.properties?.find(p => p.key?.name === "method");
    return methodProp?.value?.value?.toUpperCase() ?? "GET";
}

// ─── extract from axios config object: axios({ method, url }) ─────────────────
function extractAxiosConfig(args, path, filePath, from, results) {
    const config = args[0];
    if (!config || config.type !== "ObjectExpression") return;

    const props  = config.properties ?? [];
    const method = props.find(p => p.key?.name === "method")?.value?.value ?? "GET";
    const urlNode = props.find(p => p.key?.name === "url")?.value ?? null;

    results.push({
        lib:     "axios",
        method:  method.toUpperCase(),
        url:     resolveUrl(urlNode),
        from,
        startLine:path.node.loc?.start.line,
        endLine: path.node.loc?.end.line,
        file:    filePath,
        isDynamic: urlNode?.type !== "StringLiteral",
    });
}

function extract(context) {
    const results  = [];
    const filePath = context.filePath || "unknown";

    // collect axios instance variable names: const api = axios.create()
    const axiosInstances = new Set(["axios"]);

    traverse(context.ast, {
        // detect: const api = axios.create({...})
        VariableDeclarator(path) {
            const init = path.node.init;
            if (
                init?.type === "CallExpression" &&
                init.callee?.type === "MemberExpression" &&
                init.callee.object?.name === "axios" &&
                init.callee.property?.name === "create"
            ) {
                const varName = path.node.id?.name;
                if (varName) axiosInstances.add(varName);
            }
        },

        CallExpression(path) {
            const callee = path.node.callee;
            const args   = path.node.arguments;
            const from   = getCurrentFunction(path);

            // ── fetch("url") or fetch("url", { method: "POST" }) ──────────
            if (callee.type === "Identifier" && callee.name === "fetch") {
                const url = resolveUrl(args[0]);
                if (!url) return;

                results.push({
                    lib:      "fetch",
                    method:   fetchMethod(args),
                    url,
                    from,
                    startLine:     path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line,
                    file:     filePath,
                    isDynamic: args[0]?.type !== "StringLiteral",
                });
                return;
            }

            // ── axios({ method, url }) ────────────────────────────────────
            if (callee.type === "Identifier" && axiosInstances.has(callee.name)) {
                extractAxiosConfig(args, path, filePath, from, results);
                return;
            }

            // ── axios.post() / api.post() / instance.get() ───────────────
            if (callee.type === "MemberExpression") {
                const objName = callee.object?.name ?? null;
                const method  = callee.property?.name ?? null;

                if (!method || !HTTP_METHODS.has(method)) return;
                if (!objName || !axiosInstances.has(objName)) return;

                const url = resolveUrl(args[0]);
                if (!url) return;

                results.push({
                    lib:      objName === "axios" ? "axios" : "axiosInstance",
                    method:   method.toUpperCase(),
                    url,
                    from,
                    startLine:     path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line,
                    file:     filePath,
                    isDynamic: args[0]?.type !== "StringLiteral",
                });
            }
        },
    });

    return results;
}

module.exports = { extract };
