const traverse = require("@babel/traverse").default;

function extract(context) {
    const results = [];

    traverse(context.ast, {
        FunctionDeclaration(path) {
            if (path.node.id?.name) {
                results.push({
                    name: path.node.id.name,
                    line: path.node.loc?.start.line,
                    type: "declaration",
                });
            }
        },

        ArrowFunctionExpression(path) {
            if (path.parent.type === "VariableDeclarator" && path.parent.id?.name) {
                results.push({
                    name: path.parent.id.name,
                    line: path.node.loc?.start.line,
                    type: "arrow",
                });
            }
        },

        FunctionExpression(path) {
            if (path.parent.type === "VariableDeclarator" && path.parent.id?.name) {
                results.push({
                    name: path.parent.id.name,
                    line: path.node.loc?.start.line,
                    type: "expression",
                });
            }

            // method shorthand: { myMethod() {} }
            if (path.parent.type === "ObjectProperty" && path.parent.key?.name) {
                results.push({
                    name: path.parent.key.name,
                    line: path.node.loc?.start.line,
                    type: "method",
                });
            }
        },

        ClassMethod(path) {
            results.push({
                name: path.node.key?.name,
                line: path.node.loc?.start.line,
                type: "classMethod",
                isAsync: path.node.async,
            });
        },
    });

    return results;
}

module.exports = { extract };
