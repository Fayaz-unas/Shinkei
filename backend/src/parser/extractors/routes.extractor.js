const traverse = require("@babel/traverse").default;

const HTTP_VERBS  = ["get", "post", "put", "patch", "delete", "all", "use"];
const KNOWN_ROUTERS = ["router", "app", "server"];

function resolveMiddleware(args) {
    // collect names of middleware functions passed after the route string
    return args
        .slice(1)
        .filter(a => a.type === "Identifier")
        .map(a => a.name);
}

function extract(context) {
    const results = [];

    traverse(context.ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression") return;

            const object = callee.object?.name;
            const method = callee.property?.name;

            if (!HTTP_VERBS.includes(method)) return;

            // loosen check — catches custom router variable names too
            const args = path.node.arguments;
            if (!args.length) return;

            const routePath = args[0].type === "StringLiteral"
                ? args[0].value
                : args[0].type === "TemplateLiteral"
                    ? args[0].quasis[0]?.value.raw
                    : null;

            if (!routePath) return;

            results.push({
                method:     method.toUpperCase(),
                path:       routePath,
                router:     object ?? "unknown",
                middleware: resolveMiddleware(args),
                line:       path.node.loc?.start.line,
            });
        },
    });

    return results;
}

module.exports = { extract };
