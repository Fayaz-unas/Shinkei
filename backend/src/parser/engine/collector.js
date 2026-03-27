const traverse = require("@babel/traverse").default;

function collect(context) {
    const root = {
        type:     "file",
        file:     context.filePath,
        children: [],
    };

    const scopeStack = [root];
    const current    = () => scopeStack[scopeStack.length - 1];

    function enterFn(name, line, fnType, isAsync) {
        const node = {
            type:     "function",
            name:     name ?? "anonymous",
            line,
            fnType,
            isAsync:  !!isAsync,
            depth:    scopeStack.length - 1,  // 0 = top level, 1 = nested, etc.
            children: [],
        };
        current().children.push(node);
        scopeStack.push(node);
    }

    function exitFn() {
        scopeStack.pop();
    }

    function resolveName(callee) {
        if (callee.type === "Identifier") {
            return { name: callee.name, object: null };
        }
        if (callee.type === "MemberExpression") {
            return {
                name:   callee.property?.name ?? null,
                object: callee.object?.name   ?? null,
            };
        }
        return { name: null, object: null };
    }

    function resolveUrl(node) {
        if (!node) return null;
        if (node.type === "StringLiteral")  return node.value;
        if (node.type === "TemplateLiteral") return node.quasis[0]?.value.raw ?? null;
        return null;
    }

    const HTTP_VERBS    = ["get", "post", "put", "patch", "delete", "all", "use"];
    const HTTP_METHODS  = ["get", "post", "put", "patch", "delete", "request"];

    traverse(context.ast, {

        // ── FUNCTION ENTER / EXIT ──────────────────────────────

        FunctionDeclaration: {
            enter(path) {
                enterFn(
                    path.node.id?.name,
                    path.node.loc?.start.line,
                    "declaration",
                    path.node.async
                );
            },
            exit() { exitFn(); },
        },

        ArrowFunctionExpression: {
            enter(path) {
                const name =
                    path.parent.type === "VariableDeclarator"
                        ? path.parent.id?.name
                        : path.parentPath?.parent?.key?.name ?? null;
                enterFn(name, path.node.loc?.start.line, "arrow", path.node.async);
            },
            exit() { exitFn(); },
        },

        FunctionExpression: {
            enter(path) {
                const name =
                    path.parent.type === "VariableDeclarator"
                        ? path.parent.id?.name
                        : path.parent.key?.name ?? null;
                enterFn(name, path.node.loc?.start.line, "expression", path.node.async);
            },
            exit() { exitFn(); },
        },

        ClassMethod: {
            enter(path) {
                enterFn(
                    path.node.key?.name,
                    path.node.loc?.start.line,
                    "classMethod",
                    path.node.async
                );
            },
            exit() { exitFn(); },
        },

        // ── CALLS + ROUTES + APIS — all in one pass ───────────

        CallExpression(path) {
            const { name, object } = resolveName(path.node.callee);
            if (!name) return;

            const args = path.node.arguments;
            const line = path.node.loc?.start.line;

            // ── API: fetch()
            if (name === "fetch" && !object) {
                const method = args[1]?.properties
                    ?.find(p => p.key?.name === "method")
                    ?.value?.value?.toUpperCase() ?? "GET";

                current().children.push({
                    type:   "api",
                    lib:    "fetch",
                    method,
                    url:    resolveUrl(args[0]),
                    line,
                });
                return;
            }

            // ── API: axios.get / axios.post etc.
            if (object === "axios" && HTTP_METHODS.includes(name)) {
                current().children.push({
                    type:   "api",
                    lib:    "axios",
                    method: name.toUpperCase(),
                    url:    resolveUrl(args[0]),
                    line,
                });
                return;
            }

            // ── API: axios({ method, url })
            if (name === "axios" && !object && args[0]?.type === "ObjectExpression") {
                const props  = args[0].properties;
                const method = props.find(p => p.key?.name === "method")?.value?.value ?? "GET";
                const url    = resolveUrl(props.find(p => p.key?.name === "url")?.value);

                current().children.push({
                    type:   "api",
                    lib:    "axios",
                    method: method.toUpperCase(),
                    url,
                    line,
                });
                return;
            }

            // ── ROUTE: router.get / app.post etc.
            if (HTTP_VERBS.includes(name) && object) {
                const routePath = resolveUrl(args[0]);
                if (routePath) {
                    // resolve handler name — last Identifier argument
                    const handler = [...args]
                        .reverse()
                        .find(a => a.type === "Identifier")?.name ?? null;

                    current().children.push({
                        type:    "route",
                        method:  name.toUpperCase(),
                        path:    routePath,
                        router:  object,
                        handler,
                        line,
                    });
                    return;
                }
            }

            // ── plain CALL
            current().children.push({
                type:   "call",
                name,
                object,
                callee: object ? `${object}.${name}` : name,
                line,
            });
        },

        // ── EVENTS ────────────────────────────────────────────

        JSXAttribute(path) {
            const attrName = path.node.name?.name;
            if (typeof attrName !== "string" || !attrName.startsWith("on")) return;

            const element = path.parentPath?.parent?.name?.name ?? "unknown";
            const val     = path.node.value?.expression;
            const handler =
                val?.type === "Identifier"             ? val.name
              : val?.type === "MemberExpression"       ? `${val.object?.name}.${val.property?.name}`
              : val?.type === "ArrowFunctionExpression" ? "(inline)"
              : null;

            current().children.push({
                type:    "event",
                event:   attrName,
                element,
                handler,
                line:    path.node.loc?.start.line,
            });
        },
    });

    return root;
}

module.exports = { collect };
