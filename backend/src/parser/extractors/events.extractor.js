const traverse = require("@babel/traverse").default;

function resolveHandlerName(valueNode) {
    if (!valueNode) return null;

    // onClick={handleClick}
    if (valueNode.type === "JSXExpressionContainer") {
        const expr = valueNode.expression;
        if (expr.type === "Identifier") return expr.name;
        if (expr.type === "MemberExpression") {
            return `${expr.object?.name}.${expr.property?.name}`;
        }
        // inline arrow: onClick={() => ...}
        if (expr.type === "ArrowFunctionExpression") return "(inline)";
    }

    return null;
}

function extract(context) {
    const results = [];

    traverse(context.ast, {
        JSXAttribute(path) {
            const attrName = path.node.name?.name;
            if (typeof attrName !== "string" || !attrName.startsWith("on")) return;

            // find which JSX element owns this attribute
            const elementName = path.parentPath?.parent?.name?.name
                ?? path.parentPath?.parent?.name?.object?.name
                ?? "unknown";

            results.push({
                event:   attrName,              // "onClick", "onChange", etc.
                element: elementName,           // "button", "MyComponent", etc.
                handler: resolveHandlerName(path.node.value),
                line:    path.node.loc?.start.line,
            });
        },
    });

    return results;
}

module.exports = { extract };
