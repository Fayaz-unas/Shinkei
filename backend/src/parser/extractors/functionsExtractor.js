/**
 * functionsExtractor.js (TypeScript Compiler API Version - Production Ready)
 */

const ts = require("typescript");
const crypto = require("crypto");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeId(filePath, name, startLine) {
    return `${filePath}::${name}::${startLine}`;
}

function makeContentHash(filePath, name, startLine, endLine) {
    return crypto
        .createHash("sha1")
        .update(`${filePath}::${name}::${startLine}::${endLine}`)
        .digest("hex")
        .slice(0, 12);
}

// Check for ES6 "export" and "default" keywords
function getExportStatus(node) {
    let isExported = false;
    let isDefaultExport = false;

    if (ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node) || [];
        isExported = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        isDefaultExport = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    }
    
    // Catch `export const foo = () => {}`
    if (!isExported && node.parent && ts.isVariableDeclaration(node.parent)) {
        const statement = node.parent.parent.parent; 
        if (statement && ts.isVariableStatement(statement) && ts.canHaveModifiers(statement)) {
            const modifiers = ts.getModifiers(statement) || [];
            isExported = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        }
    }

    return { isExported, isDefaultExport };
}

// Extract name from Identifier or StringLiteral
function getPropertyName(nameNode) {
    if (!nameNode) return null;
    if (ts.isIdentifier(nameNode)) return nameNode.text;
    if (ts.isStringLiteral(nameNode)) return nameNode.text;
    return null;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────
function extract(context) {
    const { sourceFile, filePath } = context;
    const results = [];
    const seen = new Set();

    function push(entry) {
        if (!entry.name) return;
        const id = makeId(filePath, entry.name, entry.startLine);
        if (seen.has(id)) return;
        seen.add(id);

        results.push({
            id,
            contentHash: makeContentHash(filePath, entry.name, entry.startLine, entry.endLine),
            file: filePath,
            ...entry,
        });
    }

    function visit(node, currentParentName = null, currentParentId = null) {
        let newParentName = currentParentName;
        let newParentId = currentParentId;

        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const startLine = startPos.line + 1;
        const endLine = endPos.line + 1;
        const isAsync = !!(ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));

        // 1. Standard Function Declarations
        if (ts.isFunctionDeclaration(node) && node.name) {
            const name = node.name.text;
            const { isExported, isDefaultExport } = getExportStatus(node);
            
            push({
                name, startLine, endLine, type: "declaration", isAsync,
                isExported, isDefaultExport,
                parentFunction: currentParentName, parentFunctionId: currentParentId
            });

            newParentName = name;
            newParentId = makeId(filePath, name, startLine);
        }

        // 2. Arrow Functions & Function Expressions
        else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            let name = `anonymous_L${startLine}_C${startPos.character}`;
            let type = ts.isArrowFunction(node) ? "arrow" : "expression";
            let { isExported, isDefaultExport } = getExportStatus(node);

            // A. Assigned to a variable: const login = () => {}
            if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                name = node.parent.name.text;
            } 
            // B. Object property: { login: () => {} } or { "user-login": () => {} }
            else if (ts.isPropertyAssignment(node.parent)) {
                const propName = getPropertyName(node.parent.name);
                if (propName) {
                    name = propName;
                    type = "method";
                }
            }
            // C. CommonJS Exports: exports.login = () => {} OR module.exports.login = () => {}
            else if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const left = node.parent.left;
                if (ts.isPropertyAccessExpression(left)) {
                    // exports.foo = ...
                    if (ts.isIdentifier(left.expression) && left.expression.text === "exports") {
                        name = left.name.text;
                        isExported = true;
                        type = "exportAssignment";
                    }
                    // module.exports.foo = ...
                    else if (ts.isPropertyAccessExpression(left.expression) &&
                             ts.isIdentifier(left.expression.expression) && left.expression.expression.text === "module" &&
                             left.name.text === "exports") {
                        name = left.name.text;
                        isExported = true;
                        type = "exportAssignment";
                    }
                }
            }

            push({
                name, startLine, endLine, type, isAsync,
                isExported, isDefaultExport,
                parentFunction: currentParentName, parentFunctionId: currentParentId
            });

            newParentName = name;
            newParentId = makeId(filePath, name, startLine);
        }

        // 3. Class Methods, Object Methods, Getters, and Setters
        else if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
            const rawName = getPropertyName(node.name);
            
            if (rawName) {
                const isClassMethod = ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent);
                const className = isClassMethod && node.parent.name ? node.parent.name.text : null;
                const name = className ? `${className}.${rawName}` : rawName;
                const isStatic = !!(ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.StaticKeyword));
                
                let type = isClassMethod ? "classMethod" : "objectMethod";
                if (ts.isGetAccessor(node)) type = "getter";
                if (ts.isSetAccessor(node)) type = "setter";

                push({
                    name, startLine, endLine, type, isAsync, isStatic,
                    isExported: false, isDefaultExport: false,
                    parentFunction: className || currentParentName, 
                    parentFunctionId: className ? makeId(filePath, className, node.parent.getStart()) : currentParentId
                });

                newParentName = name;
                newParentId = makeId(filePath, name, startLine);
            }
        }

        // Walk children
        ts.forEachChild(node, (childNode) => visit(childNode, newParentName, newParentId));
    }

    visit(sourceFile);
    return results;
}

module.exports = { extract };