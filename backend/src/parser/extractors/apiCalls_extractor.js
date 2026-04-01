/**
 * apiCalls_extractor.js (TypeScript Compiler API Version - Production Ready)
 * * ✅ Recursively tracks calling functions (no more walking up the AST)
 * ✅ axios("/url") shorthand detected
 * ✅ axios.create({ baseURL }) tracked — baseURL merged into child call URLs
 * ✅ BinaryExpression URLs and Template Literals supported
 * ✅ Exact startLine/endLine everywhere
 */

const ts = require("typescript");

const HTTP_METHODS = new Set(["get","post","put","patch","delete","head","request","options"]);

// ─── URL Resolution ───────────────────────────────────────────────────────────
function resolveUrl(node) {
    if (!node) return { url: null, isDynamic: false, staticPrefix: null };

    // "string" or 'string'
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return { url: node.text, isDynamic: false, staticPrefix: node.text };
    }

    // `/api/users/${id}`
    if (ts.isTemplateExpression(node)) {
        const parts = [node.head.text];
        node.templateSpans.forEach(span => {
            parts.push(":param"); // Replace variable with generic param
            parts.push(span.literal.text);
        });
        return { 
            url: `dynamic:${parts.join("")}`, 
            isDynamic: true, 
            staticPrefix: node.head.text || null 
        };
    }

    // dynamicVar
    if (ts.isIdentifier(node)) {
        return { url: `dynamic:${node.text}`, isDynamic: true, staticPrefix: null };
    }

    // "/api/users/" + id
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = resolveUrl(node.left);
        const right = resolveUrl(node.right);
        const staticPrefix = !left.isDynamic ? left.url : null;
        const suffix = right.isDynamic ? ":param" : right.url;
        return {
            url: `dynamic:${staticPrefix ?? ""}${suffix}`,
            isDynamic: true,
            staticPrefix
        };
    }

    return { url: "dynamic:unknown", isDynamic: true, staticPrefix: null };
}

// ─── URL Normalization (Kept from your original logic) ────────────────────────
function normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith("dynamic:")) {
        const inner = url.slice(8).toLowerCase().trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/");
        return `dynamic:${inner}`;
    }
    return url.toLowerCase().trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

function routeMatchKey(normalizedUrl) {
    if (!normalizedUrl) return null;
    const base = normalizedUrl.startsWith("dynamic:") ? normalizedUrl.slice(8) : normalizedUrl;
    return base.replace(/\/:[a-zA-Z_][a-zA-Z0-9_]*/g, "/:param");
}

function mergeBaseUrl(base, path) {
    if (!base && !path) return null;
    if (!base) return path;
    if (!path) return base;
    if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
    return normalizeUrl(`${base}/${path}`);
}

// ─── Extractor Helpers ────────────────────────────────────────────────────────
function extractFetchMethod(args) {
    if (args.length < 2) return { method: "GET", methodIsDynamic: false };
    const options = args[1];
    
    if (ts.isObjectLiteralExpression(options)) {
        const methodProp = options.properties.find(p => 
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "method"
        );
        if (methodProp && methodProp.initializer) {
            if (ts.isStringLiteral(methodProp.initializer)) {
                return { method: methodProp.initializer.text.toUpperCase(), methodIsDynamic: false };
            }
            return { method: "DYNAMIC", methodIsDynamic: true };
        }
    }
    return { method: "GET", methodIsDynamic: false };
}

function getObjectPropString(objNode, keyName) {
    if (!ts.isObjectLiteralExpression(objNode)) return null;
    const prop = objNode.properties.find(p => 
        ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === keyName
    );
    if (prop && prop.initializer && ts.isStringLiteral(prop.initializer)) {
        return prop.initializer.text;
    }
    return null;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────
function extract(context) {
    const { sourceFile, filePath } = context;
    const results = [];
    const seen = new Set();

    // Track axios instances: varName -> baseURL
    const axiosInstances = new Map([["axios", null]]);

    function push(entry) {
        const dedupeKey = `${filePath}::${entry.method}::${entry.normalizedUrl}::${entry.from}::${entry.startLine}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        results.push(entry);
    }

    // ─── Recursive AST Walker ───
    function visit(node, currentFunction = "module") {
        let nextFunction = currentFunction;

        // 1. Track Caller Context (Who is making the HTTP call?)
        if (ts.isFunctionDeclaration(node) && node.name) {
            nextFunction = node.name.text;
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && 
                   node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            nextFunction = node.name.text;
        } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
            nextFunction = node.name.text;
            const className = ts.isClassDeclaration(node.parent) && node.parent.name ? node.parent.name.text : null;
            if (className) nextFunction = `${className}.${nextFunction}`;
        }

        // 2. Track: const api = axios.create({ baseURL: '/api' })
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
            const callee = node.initializer.expression;
            if (ts.isPropertyAccessExpression(callee) && callee.name.text === "create") {
                const objName = ts.isIdentifier(callee.expression) ? callee.expression.text : null;
                if (objName && axiosInstances.has(objName)) {
                    const varName = node.name.text;
                    let baseURL = axiosInstances.get(objName); // inherit parent
                    
                    if (node.initializer.arguments.length > 0) {
                        const configObj = node.initializer.arguments[0];
                        const extractedBaseUrl = getObjectPropString(configObj, "baseURL");
                        if (extractedBaseUrl) baseURL = mergeBaseUrl(baseURL, extractedBaseUrl);
                    }
                    axiosInstances.set(varName, baseURL || null);
                }
            }
        }

        // 3. Track API Calls
        if (ts.isCallExpression(node)) {
            const args = node.arguments;
            const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

            // A. fetch("url", options)
            if (ts.isIdentifier(node.expression) && node.expression.text === "fetch" && args.length > 0) {
                const { url, isDynamic, staticPrefix } = resolveUrl(args[0]);
                if (url) {
                    const { method, methodIsDynamic } = extractFetchMethod(args);
                    const normUrl = normalizeUrl(url);
                    push({
                        lib: "fetch", method, methodIsDynamic,
                        url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                        baseUrl: null, staticPrefix,
                        from: nextFunction, startLine, endLine, file: filePath, isDynamic
                    });
                }
            }

            // B. axios("url") shorthand OR axios({ method, url })
            else if (ts.isIdentifier(node.expression) && axiosInstances.has(node.expression.text)) {
                const instanceName = node.expression.text;
                const baseUrl = axiosInstances.get(instanceName);

                if (args.length > 0) {
                    // axios("url")
                    if (ts.isStringLiteral(args[0]) || ts.isNoSubstitutionTemplateLiteral(args[0])) {
                        const { url, isDynamic } = resolveUrl(args[0]);
                        const mergedUrl = mergeBaseUrl(baseUrl, url);
                        const normUrl = normalizeUrl(mergedUrl || url);
                        push({
                            lib: instanceName === "axios" ? "axios" : "axiosInstance",
                            method: "GET", methodIsDynamic: false,
                            url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                            baseUrl, staticPrefix: null,
                            from: nextFunction, startLine, endLine, file: filePath, isDynamic
                        });
                    } 
                    // axios({ method: 'POST', url: '/users' })
                    else if (ts.isObjectLiteralExpression(args[0])) {
                        const configObj = args[0];
                        const methodStr = getObjectPropString(configObj, "method") || "GET";
                        const rawUrlNode = configObj.properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "url");
                        
                        if (rawUrlNode && ts.isPropertyAssignment(rawUrlNode)) {
                            const { url, isDynamic, staticPrefix } = resolveUrl(rawUrlNode.initializer);
                            const mergedUrl = mergeBaseUrl(baseUrl, url);
                            const normUrl = normalizeUrl(mergedUrl || url);
                            push({
                                lib: instanceName === "axios" ? "axios" : "axiosInstance",
                                method: methodStr.toUpperCase(), methodIsDynamic: methodStr === "DYNAMIC",
                                url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                                baseUrl, staticPrefix,
                                from: nextFunction, startLine, endLine, file: filePath, isDynamic
                            });
                        }
                    }
                }
            }

            // C. api.get('/users') or axios.post('/users')
            else if (ts.isPropertyAccessExpression(node.expression)) {
                const objName = ts.isIdentifier(node.expression.expression) ? node.expression.expression.text : null;
                const method = node.expression.name.text;

                if (objName && axiosInstances.has(objName) && HTTP_METHODS.has(method.toLowerCase()) && args.length > 0) {
                    const { url, isDynamic, staticPrefix } = resolveUrl(args[0]);
                    if (url) {
                        const baseUrl = axiosInstances.get(objName);
                        const mergedUrl = mergeBaseUrl(baseUrl, url);
                        const normUrl = normalizeUrl(mergedUrl || url);

                        push({
                            lib: objName === "axios" ? "axios" : "axiosInstance",
                            method: method.toUpperCase(), methodIsDynamic: false,
                            url, normalizedUrl: normUrl, routeMatchKey: routeMatchKey(normUrl),
                            baseUrl, staticPrefix,
                            from: nextFunction, startLine, endLine, file: filePath, isDynamic
                        });
                    }
                }
            }
        }

        // Keep walking
        ts.forEachChild(node, (childNode) => visit(childNode, nextFunction));
    }

    visit(sourceFile);
    return results;
}

module.exports = { extract };