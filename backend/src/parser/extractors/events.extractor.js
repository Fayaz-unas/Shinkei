const traverse = require("@babel/traverse").default;

/**
 * events.extractor.js
 *
 * Detects ALL UI event handlers in JSX.
 * These are the ENTRY POINTS of every execution flow.
 *
 * Handles:
 *  - direct handler ref             → onClick={handleLogin}
 *  - member handler                 → onClick={auth.handleLogin}
 *  - inline arrow (single call)     → onClick={() => loginUser()}
 *  - inline arrow (multiple calls)  → onClick={() => { login(); track(); }}
 *  - inline arrow with args         → onClick={() => login(user)}
 *  - all event types                → onClick, onSubmit, onChange, onKeyDown, etc.
 *  - native + custom elements       → <button>, <MyComponent>
 *  - callsInside                    → extracts function names called inside inline arrows
 */

// ─── extract all function calls inside an arrow body ─────────────────────────
function extractCallsInsideArrow(arrowNode) {
    const calls = [];

    function walk(node) {
        if (!node || typeof node !== "object") return;

        if (node.type === "CallExpression") {
            const callee = node.callee;
            let name = null;

            if (callee.type === "Identifier") {
                name = callee.name;
            } else if (callee.type === "MemberExpression") {
                const obj  = callee.object?.name  ?? null;
                const prop = callee.property?.name ?? null;
                name = obj && prop ? `${obj}.${prop}` : prop ?? obj;
            }

            if (name) calls.push(name);

            // walk arguments for nested calls: login(getData())
            (node.arguments || []).forEach(walk);
        }

        // walk body
        if (node.body) walk(node.body);
        if (node.expression) walk(node.expression);

        // walk block statement
        if (Array.isArray(node.body)) node.body.forEach(walk);
        if (node.type === "BlockStatement" && Array.isArray(node.body)) {
            node.body.forEach(stmt => walk(stmt));
        }

        // walk expression statements
        if (node.type === "ExpressionStatement") walk(node.expression);

        // walk return statements
        if (node.type === "ReturnStatement") walk(node.argument);
    }

    walk(arrowNode.body);
    return calls;
}

// ─── resolve handler from JSX attribute value ────────────────────────────────
function resolveHandler(valueNode) {
    if (!valueNode) return { handler: null, callsInside: [] };

    if (valueNode.type === "JSXExpressionContainer") {
        const expr = valueNode.expression;

        // onClick={handleLogin}
        if (expr.type === "Identifier") {
            return { handler: expr.name, callsInside: [] };
        }

        // onClick={auth.handleLogin}
        if (expr.type === "MemberExpression") {
            const obj  = expr.object?.name  ?? null;
            const prop = expr.property?.name ?? null;
            return {
                handler: obj && prop ? `${obj}.${prop}` : prop ?? obj,
                callsInside: [],
            };
        }

        // onClick={() => loginUser()}  OR  onClick={() => { login(); track(); }}
        if (
            expr.type === "ArrowFunctionExpression" ||
            expr.type === "FunctionExpression"
        ) {
            const callsInside = extractCallsInsideArrow(expr);
            return {
                handler: callsInside.length === 1 ? callsInside[0] : "inline",
                callsInside,
            };
        }

        // onClick={condition ? handlerA : handlerB}
        if (expr.type === "ConditionalExpression") {
            const a = expr.consequent?.name ?? null;
            const b = expr.alternate?.name  ?? null;
            return {
                handler: "conditional",
                callsInside: [a, b].filter(Boolean),
            };
        }
    }

    return { handler: null, callsInside: [] };
}

function extract(context) {
    const results = [];
    const filePath = context.filePath || "unknown";

    traverse(context.ast, {
        JSXAttribute(path) {
            const attrName = path.node.name?.name;

            // only event attributes: onClick, onSubmit, onChange, onKeyDown, etc.
            if (typeof attrName !== "string" || !attrName.startsWith("on")) return;

            // get element that owns this attribute
            const openingEl = path.parentPath?.node;
            let element = "unknown";
            if (openingEl?.name?.type === "JSXIdentifier") {
                element = openingEl.name.name;
            } else if (openingEl?.name?.type === "JSXMemberExpression") {
                element = `${openingEl.name.object?.name}.${openingEl.name.property?.name}`;
            }

            const { handler, callsInside } = resolveHandler(path.node.value);

            // skip if completely unresolvable (e.g. onClick={someComplexExpr})
            if (!handler && callsInside.length === 0) return;

            results.push({
                event:       attrName,        // "onClick" | "onSubmit" | etc.
                element,                       // "button" | "LoginForm" | etc.
                handler,                       // direct handler name or "inline"
                callsInside,                   // functions called inside inline arrow
                startLine:        path.node.loc?.start.line,
                endLine:     path.node.loc?.end.line,
                file:        filePath,
                isInline:    handler === "inline" || callsInside.length > 0,
            });
        },
    });

    return results;
}

module.exports = { extract };
