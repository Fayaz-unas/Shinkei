const traverse = require("@babel/traverse").default;

function extract(context) {
    const results = [];

    traverse(context.ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            let name = null;
            let object = null;

            if (callee.type === "Identifier") {
                name = callee.name;
            }

            if (callee.type === "MemberExpression") {
                name   = callee.property?.name;
                object = callee.object?.name ?? null;
            }

            // skip traversal noise — unresolvable or anonymous calls
            if (!name) return;

            results.push({
                name,
                object,                          // e.g. "router" in router.get()
                callee: object ? `${object}.${name}` : name,
                line: path.node.loc?.start.line,
                argumentCount: path.node.arguments.length,
            });
        },
    });

    return results;
}

module.exports = { extract };
