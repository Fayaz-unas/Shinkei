const e = require("express");

const traverse = require("@babel/traverse").default;

/**
 * imports.extractor.js
 *
 * Detects ALL import/require statements in a JS/JSX/TS/TSX file.
 * CRITICAL for cross-file flow tracing.
 *
 * Upgraded to perfectly support:
 * - export * from "./auth" (barrel exports)
 * - export { default } from "./auth" (default re-exports)
 * - require(someVar) (dynamic require safety)
 * - require("./setup") (side-effect requires)
 * - path normalization ("./auth.js" === "./auth")
 * - consistent import types & TS type distinction
 */

function normalizeSource(source) {
    if (!source || source === "dynamic") return source;
    // Normalize path by stripping common extensions so analyzer matches cleanly
    return source.replace(/\.(js|jsx|ts|tsx)$/, "");
}

function extract(context) {
    const results  = [];
    const filePath = context.filePath || "unknown";

    // Helper to enforce the final target structure
    function pushResult(entry) {
        results.push({
            name: entry.name ?? null,
            importedAs: entry.importedAs ?? null,
            source: normalizeSource(entry.source),
            type: entry.type ?? "unknown",
            isLocal: entry.isLocal ?? false,
            isDynamic: entry.isDynamic ?? false,
            isType: entry.isType ?? false,
            startLine: entry.startLine ?? null,
            endLine: entry.endLine ?? null,
            file: filePath
        });
    }

    traverse(context.ast, {

        // ── import { loginUser } from "./auth" ─────────────────────────────
        ImportDeclaration(path) {
            const source  = path.node.source?.value ?? null;
            const isLocal = source?.startsWith(".") ?? false;
            const isDeclType = path.node.importKind === "type";

            // handle: import "./styles.css" (side-effect only)
            if (path.node.specifiers.length === 0) {
                pushResult({
                    source,
                    type: "sideEffect",
                    isLocal,
                    isType: isDeclType,
                    startLine: path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line
                });
                return;
            }

            path.node.specifiers.forEach(spec => {
                let name       = null;
                let importedAs = null;
                let type       = "unknown";
                
                const isSpecType = spec.importKind === "type";
                const isType = isDeclType || isSpecType;

                if (spec.type === "ImportSpecifier") {
                    name       = spec.imported?.name ?? null;
                    importedAs = spec.local?.name    ?? name;
                    type       = "named";
                } else if (spec.type === "ImportDefaultSpecifier") {
                    name       = "default";
                    importedAs = spec.local?.name ?? null;
                    type       = "default";
                } else if (spec.type === "ImportNamespaceSpecifier") {
                    name       = "*";
                    importedAs = spec.local?.name ?? null;
                    type       = "namespace";
                }

                pushResult({ name, importedAs, source, type, isLocal, isType, startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line });
            });
        },

        // ── const { loginUser } = require("./auth") ───────────────────────
        VariableDeclarator(path) {
            const init = path.node.init;
            if (!init || init.type !== "CallExpression" || init.callee?.name !== "require" || !init.arguments?.length) return;

            const arg = init.arguments[0];
            let source = null;
            let isDynamic = false;

            if (arg.type === "StringLiteral") {
                source = arg.value;
            } else {
                source = "dynamic";
                isDynamic = true;
            }
            
            const isLocal = source?.startsWith(".") ?? false;

            if (path.node.id?.type === "ObjectPattern") {
                path.node.id.properties.forEach(prop => {
                    pushResult({
                        name: prop.key?.name ?? null,
                        importedAs: prop.value?.name ?? prop.key?.name ?? null,
                        source,
                        type: "named",
                        isLocal,
                        isDynamic,
                        startLine: path.node.loc?.start.line,
                        endLine: path.node.loc?.end.line
                    });
                });
            } else if (path.node.id?.type === "Identifier") {
                pushResult({
                    name: "default",
                    importedAs: path.node.id.name,
                    source,
                    type: "default",
                    isLocal,
                    isDynamic,
                    startLine: path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line
                });
            }
        },

        // ── require("./setup")  (Side-effect require) ─────────────────────
        ExpressionStatement(path) {
            const expr = path.node.expression;
            if (expr.type === "CallExpression" && expr.callee?.name === "require" && expr.arguments?.length) {
                const arg = expr.arguments[0];
                let source = null;
                let isDynamic = false;

                if (arg.type === "StringLiteral") {
                    source = arg.value;
                } else {
                    source = "dynamic";
                    isDynamic = true;
                }

                pushResult({
                    source,
                    type: "sideEffect",
                    isLocal: source?.startsWith(".") ?? false,
                    isDynamic,
                    startLine: path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line
                });
            }
        },

        // ── import("./auth")  dynamic import ──────────────────────────────
        CallExpression(path) {
            if (path.node.callee?.type !== "Import") return;
            
            const arg = path.node.arguments[0];
            let source = null;
            let isDynamic = true; // Overall nature is dynamic

            if (arg?.type === "StringLiteral") {
                source = arg.value;
            } else {
                source = "dynamic";
            }

            pushResult({
                name: "*",
                source,
                type: "dynamic",
                isLocal: source?.startsWith(".") ?? false,
                isDynamic,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line
            });
        },

        // ── export { loginUser, default as login } from "./auth" ──────────
        ExportNamedDeclaration(path) {
            if (!path.node.source) return;
            const source  = path.node.source.value;
            const isLocal = source?.startsWith(".") ?? false;
            const isType  = path.node.exportKind === "type";

            path.node.specifiers.forEach(spec => {
                pushResult({
                    name: spec.local?.name ?? null,
                    importedAs: spec.exported?.name ?? null,
                    source,
                    type: "reExport",
                    isLocal,
                    isType,
                    startLine: path.node.loc?.start.line,
                    endLine: path.node.loc?.end.line
                });
            });
        },

        // ── export * from "./auth" (Barrel export) ────────────────────────
        ExportAllDeclaration(path) {
            const source = path.node.source?.value ?? null;
            const isLocal = source?.startsWith(".") ?? false;

            pushResult({
                name: "*",
                source,
                type: "reExportAll",
                isLocal,
                startLine: path.node.loc?.start.line,
                endLine: path.node.loc?.end.line
            });
        }
    });

    return results;
}

module.exports = { extract };