const traverse = require("@babel/traverse").default;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "request"];

function resolveUrl(argNode) {
    if (!argNode) return null;
    if (argNode.type === "StringLiteral") return argNode.value;
    if (argNode.type === "TemplateLiteral") return argNode.quasis[0]?.value.raw ?? null;
    return null;
}

function extract(context) {
    const results = [];

    traverse(context.ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            const args   = path.node.arguments;

            // fetch("url") or fetch("url", { method })
            if (callee.type === "Identifier" && callee.name === "fetch") {
                const method = args[1]?.properties
                    ?.find(p => p.key?.name === "method")
                    ?.value?.value?.toUpperCase() ?? "GET";

                results.push({
                    lib:    "fetch",
                    method,
                    url:    resolveUrl(args[0]),
                    line:   path.node.loc?.start.line,
                });
                return;
            }

            // axios.get / axios.post / axios({ method })
            if (callee.type === "MemberExpression") {
                const obj    = callee.object?.name;
                const method = callee.property?.name;

                if (obj === "axios" && HTTP_METHODS.includes(method)) {
                    results.push({
                        lib:    "axios",
                        method: method.toUpperCase(),
                        url:    resolveUrl(args[0]),
                        line:   path.node.loc?.start.line,
                    });
                }
            }

            // axios({ method: "get", url: "..." })
            if (callee.type === "Identifier" && callee.name === "axios") {
                const props = args[0]?.properties ?? [];
                const method = props.find(p => p.key?.name === "method")?.value?.value ?? "GET";
                const url    = resolveUrl(props.find(p => p.key?.name === "url")?.value);

                results.push({
                    lib:    "axios",
                    method: method.toUpperCase(),
                    url,
                    line:   path.node.loc?.start.line,
                });
            }
        },
    });

    return results;
}

module.exports = { extract };
