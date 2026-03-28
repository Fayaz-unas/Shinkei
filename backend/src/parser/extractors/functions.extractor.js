const traverse = require("@babel/traverse").default;

/**
 * functions.extractor.js
 *
 * Detects ALL function definitions in a JS/JSX file.
 *
 * Handles:
 *  - function declarations          → function login() {}
 *  - arrow functions                → const login = () => {}
 *  - function expressions           → const login = function() {}
 *  - object methods                 → { login() {} }
 *  - object property functions      → obj.login = function() {}
 *  - class methods                  → class A { login() {} }
 *  - export named functions         → export function login() {}
 *  - export default functions       → export default function login() {}
 *  - anonymous functions            → setTimeout(() => {})  → "anonymous_<line>"
 *  - async functions                → async function login() {}
 *  - unique ID per function         → filePath::functionName
 */

function extract(context) {
    const results = [];
    const filePath = context.filePath || "unknown";

    // helper — push with deduplication guard
    function push(entry) {
        if (!entry.name) return;
        entry.id = `${filePath}::${entry.name}`;
        entry.file = filePath;
        results.push(entry);
    }

    traverse(context.ast, {
        // ─── function login() {} ───────────────────────────────────────────
        FunctionDeclaration(path) {
            const name = path.node.id?.name ?? `anonymous_${path.node.loc?.start.line}`;
            const isExported =
                path.parent.type === "ExportNamedDeclaration" ||
                path.parent.type === "ExportDefaultDeclaration";
            const isDefaultExport = path.parent.type === "ExportDefaultDeclaration";

            push({
                name,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line,
                type: "declaration",
                isAsync: path.node.async ?? false,
                isExported,
                isDefaultExport,
            });
        },

        // ─── const login = () => {} ────────────────────────────────────────
        ArrowFunctionExpression(path) {
            let name = null;

            if (path.parent.type === "VariableDeclarator") {
                name = path.parent.id?.name ?? null;
            }

            // export const login = () => {}
            if (!name && path.parentPath?.parent?.type === "VariableDeclaration") {
                name = path.parent.id?.name ?? null;
            }

            // anonymous arrow passed as argument → setTimeout(() => {})
            if (!name) {
                name = `anonymous_${path.node.loc?.start.line}`;
            }

            const isExported =
                path.parentPath?.parentPath?.parent?.type === "ExportNamedDeclaration";

            push({
                name,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line,
                type: "arrow",
                isAsync: path.node.async ?? false,
                isExported,
                isDefaultExport: false,
            });
        },

        // ─── const login = function() {} ──────────────────────────────────
        FunctionExpression(path) {
            let name = null;
            let type = "expression";

            // const login = function() {}
            if (path.parent.type === "VariableDeclarator") {
                name = path.parent.id?.name ?? null;
            }

            // { login() {} }  object method shorthand
            if (path.parent.type === "ObjectProperty") {
                name = path.parent.key?.name ?? path.parent.key?.value ?? null;
                type = "method";
            }

            // obj.login = function() {}
            if (path.parent.type === "AssignmentExpression") {
                const left = path.parent.left;
                if (left.type === "MemberExpression") {
                    name = left.property?.name ?? null;
                    type = "method";
                }
            }

            // export default function() {}
            if (path.parent.type === "ExportDefaultDeclaration") {
                name = "defaultExport";
                type = "expression";
            }

            if (!name) {
                name = `anonymous_${path.node.loc?.start.line}`;
            }

            push({
                name,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line,
                type,
                isAsync: path.node.async ?? false,
                isExported: path.parent.type === "ExportNamedDeclaration",
                isDefaultExport: path.parent.type === "ExportDefaultDeclaration",
            });
        },

        // ─── class A { login() {} } ────────────────────────────────────────
        ClassMethod(path) {
            const name = path.node.key?.name ?? path.node.key?.value ?? null;
            if (!name) return;

            push({
                name,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line,   
                type: "classMethod",
                isAsync: path.node.async ?? false,
                isStatic: path.node.static ?? false,
                kind: path.node.kind, // "constructor" | "method" | "get" | "set"
                isExported: false,
                isDefaultExport: false,
            });
        },

        // ─── class A { login = () => {} } ──────────────────────────────────
        ClassProperty(path) {
            const value = path.node.value;
            if (
                value?.type !== "ArrowFunctionExpression" &&
                value?.type !== "FunctionExpression"
            ) return;

            const name = path.node.key?.name ?? null;
            if (!name) return;

            push({
                name,
                line: path.node.loc?.start.line,
                type: "classArrow",
                isAsync: value.async ?? false,
                isStatic: path.node.static ?? false,
                isExported: false,
                isDefaultExport: false,
            });
        },
    });

    return results;
}

module.exports = { extract };
