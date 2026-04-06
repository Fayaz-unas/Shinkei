/**
 * eventsExtractor.js (TypeScript Compiler API Version - Production Ready)
 * * ✅ Top-down React component tracking (no more walking up the AST).
 * ✅ handlerFunctionId perfectly resolved via TypeChecker.
 * ✅ "inline" multi-call arrows preserved and deeply extracted.
 * ✅ Exact startLine/endLine everywhere.
 */

const ts = require("typescript");

// ─── Extract nested calls inside an inline arrow: onClick={() => { a(); b(); }} ──
function extractCallsInside(node) {
    const calls = [];
    
    function visit(child) {
        if (ts.isCallExpression(child)) {
            let name = null;
            if (ts.isIdentifier(child.expression)) {
                name = child.expression.text;
            } else if (ts.isPropertyAccessExpression(child.expression)) {
                const obj = ts.isIdentifier(child.expression.expression) ? child.expression.expression.text : "?";
                const prop = child.expression.name.text;
                name = `${obj}.${prop}`;
            }
            if (name) calls.push({ name, callNode: child.expression });
        }
        ts.forEachChild(child, visit);
    }
    
    visit(node);
    return calls;
}

// ─── Resolve the handler from the JSX Attribute ───────────────────────────────
function resolveHandler(expr) {
    if (!expr) return { handler: null, callsInside: [], isDynamic: false, handlerNode: null };

    // onClick={handleLogin}
    if (ts.isIdentifier(expr)) {
        return { handler: expr.text, callsInside: [], isDynamic: false, handlerNode: expr };
    }

    // onClick={auth.handleLogin}
    if (ts.isPropertyAccessExpression(expr)) {
        const obj = ts.isIdentifier(expr.expression) ? expr.expression.text : "?";
        const prop = expr.name.text;
        return { handler: `${obj}.${prop}`, callsInside: [], isDynamic: false, handlerNode: expr.name };
    }

    // onClick={handlers[key]} (Dynamic)
    if (ts.isElementAccessExpression(expr)) {
        return { handler: "dynamic", callsInside: [], isDynamic: true, handlerNode: null };
    }

    // onClick={() => login()}
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        const extracted = extractCallsInside(expr);
        const callsInsideNames = extracted.map(c => c.name);
        const callsInsideNodes = extracted.map(c => c.callNode);

        if (callsInsideNames.length === 1) {
            return { handler: callsInsideNames[0], callsInside: callsInsideNames, callsInsideNodes, isDynamic: false, handlerNode: callsInsideNodes[0] };
        }
        return { handler: callsInsideNames.length > 1 ? "inline" : null, callsInside: callsInsideNames, callsInsideNodes, isDynamic: false, handlerNode: null };
    }

    // onClick={condition ? handlerA : handlerB}
    if (ts.isConditionalExpression(expr)) {
        const branches = [];
        [expr.whenTrue, expr.whenFalse].forEach(branch => {
            if (ts.isIdentifier(branch)) branches.push(branch.text);
            else if (ts.isPropertyAccessExpression(branch)) branches.push(branch.name.text);
        });
        return { handler: "conditional", callsInside: branches, isDynamic: false, handlerNode: null };
    }

    return { handler: null, callsInside: [], isDynamic: false, handlerNode: null };
}

// ─── Main Extractor ───────────────────────────────────────────────────────────
function extract(context) {
    const { sourceFile, checker, filePath } = context;
    const results = [];
    const seen = new Set();

    // ─── TypeChecker Magic for Handlers ───
    function getFunctionId(node) {
        if (!node) return null;
        
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol) return null;
        
        const targetSymbol = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const decl = targetSymbol.valueDeclaration || (targetSymbol.declarations && targetSymbol.declarations[0]);
        
        if (decl) {
            const declFile = decl.getSourceFile();
            const startLine = declFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
            let targetName = targetSymbol.name;
            return `${declFile.fileName}::${targetName}::${startLine}`;
        }
        return null;
    }

    function push(entry) {
        const dedupeKey = `${filePath}::${entry.event}::${entry.handler}::${entry.startLine}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        results.push(entry);
    }

    // ─── Recursive AST Walker ───
    // We pass the React Component and the DOM Element state down the tree!
    function visit(node, currentComponent = "unknown", isReact = false, currentElement = "unknown") {
        let nextComponent = currentComponent;
        let nextIsReact = isReact;
        let nextElement = currentElement;

        // 1. Track React Component Context
        if (ts.isFunctionDeclaration(node) && node.name) {
            nextComponent = node.name.text;
            nextIsReact = /^[A-Z]/.test(nextComponent); // PascalCase heuristic
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && 
                  node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            nextComponent = node.name.text;
            nextIsReact = /^[A-Z]/.test(nextComponent);
        } else if (ts.isClassDeclaration(node) && node.name) {
            nextComponent = node.name.text;
            nextIsReact = true;
        }

        // 2. Track JSX Element Context (e.g., <button>, <LoginForm>)
        if (ts.isJsxElement(node)) {
            nextElement = ts.isIdentifier(node.openingElement.tagName) ? node.openingElement.tagName.text : "unknown";
        } else if (ts.isJsxSelfClosingElement(node)) {
            nextElement = ts.isIdentifier(node.tagName) ? node.tagName.text : "unknown";
        }

        // 3. Extract JSX Attributes (Events)
        if (ts.isJsxAttribute(node) && node.name) {
            const attrName = node.name.text;
            
            // Only care about "on*" events
            if (attrName.startsWith("on") && node.initializer && ts.isJsxExpression(node.initializer)) {
                const { handler, callsInside, callsInsideNodes, isDynamic, handlerNode } = resolveHandler(node.initializer.expression);
                
                if (handler || callsInside.length > 0) {
                    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

                    // Use the TypeChecker to get the exact ID of the handler!
                    const handlerFunctionId = getFunctionId(handlerNode) || (handler && handler !== "inline" ? `${filePath}::${handler}` : null);
                    
                    // Resolve IDs for all inline calls too
                    const callFunctionIds = (callsInsideNodes || []).map((cNode, i) => 
                        getFunctionId(cNode) || `${filePath}::${callsInside[i]}`
                    );

                    push({
                        event: attrName,
                        element: nextElement,
                        component: nextComponent,
                        isReactComponent: nextIsReact,
                        handler,
                        handlerFunctionId,
                        callsInside,
                        callFunctionIds,
                        isInline: handler === "inline",
                        isConditional: handler === "conditional",
                        isDynamic,
                        startLine,
                        endLine,
                        file: filePath,
                    });
                }
            }
        }

        // Keep walking
        ts.forEachChild(node, (childNode) => visit(childNode, nextComponent, nextIsReact, nextElement));
    }

    visit(sourceFile);
    return results;
}

module.exports = { extract };