const traverse = require("@babel/traverse").default;

/**
 * routes.extractor.js
 *
 * Detects ALL backend route definitions in Express/Node.js files.
 *
 * Handles:
 *  - app.get/post/put/delete/patch   → app.post("/api/login", controller)
 *  - router.get/post/...             → router.post("/api/login", controller)
 *  - custom router variable names    → const r = express.Router(); r.get(...)
 *  - arrow function handlers         → router.post("/x", (req, res) => {})
 *  - middleware chains               → router.post("/x", auth, validate, controller)
 *  - dynamic route params            → router.get("/user/:id") → marked dynamic
 *  - template literal routes         → router.get(`/user/${id}`) → marked dynamic
 *  - router.use() for middleware      → app.use("/api", router)
 *  - Next.js API route files         → export default handler / export async function GET
 *  - handler = LAST arg, rest = middleware
 */

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "all", "use"]);

// ─── collect all express.Router() variable names in file ─────────────────────
function collectRouterNames(ast) {
    const names = new Set(["app", "router", "server"]);

    traverse(ast, {
        VariableDeclarator(path) {
            const init = path.node.init;
            if (!init) return;

            // const router = express.Router()
            if (
                init.type === "CallExpression" &&
                init.callee?.type === "MemberExpression" &&
                init.callee.property?.name === "Router"
            ) {
                const name = path.node.id?.name;
                if (name) names.add(name);
            }

            // const r = router  (alias)
            if (init.type === "Identifier" && names.has(init.name)) {
                const name = path.node.id?.name;
                if (name) names.add(name);
            }
        },
    });

    return names;
}

// ─── resolve route path from AST node ─────────────────────────────────────────
function resolveRoutePath(node) {
    if (!node) return null;

    if (node.type === "StringLiteral") return node.value;

    // template literal: `/user/${id}` → dynamic
    if (node.type === "TemplateLiteral") {
        const staticPart = node.quasis.map(q => q.value.raw).join(":param");
        return `dynamic:${staticPart}`;
    }

    if (node.type === "Identifier") return `dynamic:${node.name}`;

    return null;
}

// ─── extract handler + middleware from args after route string ─────────────────
function resolveHandlers(args) {
    // args[0] is the route path — skip it
    const rest = args.slice(1);

    const middleware = [];
    let handler = null;

    rest.forEach((arg, i) => {
        const isLast = i === rest.length - 1;

        if (arg.type === "Identifier") {
            if (isLast) {
                handler = arg.name;
            } else {
                middleware.push(arg.name);
            }
            return;
        }

        // inline arrow/function handler: (req, res) => {}
        if (
            arg.type === "ArrowFunctionExpression" ||
            arg.type === "FunctionExpression"
        ) {
            if (isLast) {
                handler = "inline";
            } else {
                middleware.push("inline");
            }
            return;
        }

        // array of middleware: router.get("/x", [auth, validate], controller)
        if (arg.type === "ArrayExpression") {
            arg.elements.forEach(el => {
                if (el?.type === "Identifier") middleware.push(el.name);
            });
        }
    });

    return { handler, middleware };
}

function extract(context) {
    const results  = [];
    const filePath = context.filePath || "unknown";
    const routerNames = collectRouterNames(context.ast);

    // ── detect Next.js API route exports ──────────────────────────────────────
    const isNextApiRoute =
        filePath.includes("/api/") &&
        (filePath.endsWith(".js") || filePath.endsWith(".jsx"));

    traverse(context.ast, {
        // ── Express: app.post("/route", handler) ───────────────────────────
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression") return;

            const object = callee.object?.name ?? null;
            const method = callee.property?.name ?? null;

            if (!method || !HTTP_VERBS.has(method)) return;

            // accept known router variable names
            if (!object || !routerNames.has(object)) return;

            const args      = path.node.arguments;
            if (!args.length) return;

            const routePath = resolveRoutePath(args[0]);
            if (!routePath) return;

            const { handler, middleware } = resolveHandlers(args);

            results.push({
                method:     method.toUpperCase(),
                path:       routePath,
                router:     object,
                handler,
                middleware,
                isDynamic: routePath.startsWith("dynamic:") || routePath.includes(":"),
                isUse: method === "use",
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line,
                file: filePath,
            });
        },

        // ── Next.js: export async function GET(req) {} ─────────────────────
        ExportNamedDeclaration(path) {
            if (!isNextApiRoute) return;

            const decl = path.node.declaration;
            if (!decl) return;

            const name = decl.id?.name ?? decl.declarations?.[0]?.id?.name ?? null;
            if (!name) return;

            const httpMethod = ["GET", "POST", "PUT", "PATCH", "DELETE"].find(
                m => name.toUpperCase() === m
            );
            if (!httpMethod) return;

            // derive route from file path: pages/api/login.js → /api/login
            const routePath = filePath
                .replace(/.*\/(pages|app)/, "")
                .replace(/\/route\.(js|jsx|ts|tsx)$/, "")
                .replace(/\.(js|jsx|ts|tsx)$/, "")
                || "/";

            results.push({
                method:    httpMethod,
                path:      routePath,
                router:    "nextjs",
                handler:   name,
                middleware: [],
                isDynamic: routePath.includes("["),
                isUse:     false,
                line:      decl.loc?.start.line,
                file:      filePath,
            });
        },

        // ── Next.js: export default function handler(req, res) {} ──────────
        ExportDefaultDeclaration(path) {
            if (!isNextApiRoute) return;

            const routePath = filePath
                .replace(/.*\/(pages|app)/, "")
                .replace(/\.(js|jsx)$/, "")
                || "/";

            results.push({
                method:    "ALL",
                path:      routePath,
                router:    "nextjs",
                handler:   "default",
                middleware: [],
                isDynamic: routePath.includes("["),
                isUse:     false,
                line:      path.node.loc?.start.line,
                file:      filePath,
            });
        },
    });

    return results;
}

module.exports = { extract };
