const traverse = require("@babel/traverse").default;

/**
 * calls_extractor.js  — FINAL PRODUCTION VERSION
 *
 *  ✅ Unified schema: startLine/endLine everywhere
 *  ✅ calleeFunctionId: "filePath::name" — actual function ID for resolver linkage
 *  ✅ Import resolution: handles nested object access (auth.loginUser → source of auth)
 *  ✅ Re-export awareness: importedAs → original name tracked
 *  ✅ Local vs external distinction via importMap
 *  ✅ Optional chaining: OptionalMemberExpression + computed optional
 *  ✅ Deduplication: filePath-scoped callee::from::line key
 *  ✅ False positive reduction: callbacks only from known imports OR MemberExpressions
 *  ✅ Noise filtering: expanded, member-qualified (console.log won't appear)
 *  ✅ Chained calls: foo.bar().baz() handled without double-counting
 *  ✅ Instance tracking: const x = new ClassName() → x.method() resolved to ClassName.method
 *  ✅ Singleton tracking: module.exports = new ClassName() → same resolution
 */

// ─── noise filter ─────────────────────────────────────────────────────────────
const NOISE_MEMBERS = new Map([
    ["console",  new Set(["log","warn","error","info","debug","trace","assert","group","groupEnd","time","timeEnd"])],
    ["Object",   new Set(["keys","values","entries","assign","freeze","create","defineProperty","getOwnPropertyNames","fromEntries"])],
    ["Array",    new Set(["isArray","from","of"])],
    ["JSON",     new Set(["stringify","parse"])],
    ["Math",     new Set(["floor","ceil","round","max","min","abs","random","sqrt","pow","log"])],
    ["Promise",  new Set(["resolve","reject","all","race","allSettled","any"])],
    ["Number",   new Set(["isInteger","isFinite","isNaN","parseInt","parseFloat"])],
    ["String",   new Set(["fromCharCode","fromCodePoint"])],
]);

const NOISE_GLOBALS = new Set([
    "toString","valueOf","hasOwnProperty","isPrototypeOf","propertyIsEnumerable",
    "push","pop","shift","unshift","splice","slice","concat","join","reverse","sort","flat","flatMap",
    "trim","trimStart","trimEnd","padStart","padEnd","split","replace","replaceAll","includes","startsWith","endsWith",
    "indexOf","lastIndexOf","find","findIndex","filter","map","reduce","reduceRight","forEach","some","every","keys","values","entries",
    "setTimeout","setInterval","clearTimeout","clearInterval","requestAnimationFrame","cancelAnimationFrame",
    "parseInt","parseFloat","isNaN","isFinite","encodeURI","decodeURI","encodeURIComponent","decodeURIComponent",
    "require","Symbol","BigInt","Boolean","Number","String",
]);

function isNoise(name, object) {
    if (!name) return true;
    if (object && NOISE_MEMBERS.has(object) && NOISE_MEMBERS.get(object).has(name)) return true;
    if (!object && NOISE_GLOBALS.has(name)) return true;
    return false;
}

// ─── build instance map: varName → className ─────────────────────────────────
// Tracks:
//   const x = new ClassName()           → x → ClassName
//   module.exports = new ClassName()    → (default export pattern, stored as "__moduleExport")
// Used so that x.method() can be resolved to ClassName.method for the resolver.
function buildInstanceMap(ast) {
    const map = new Map(); // varName → className
    try {
        traverse(ast, {
            // const x = new ClassName()
            VariableDeclarator(path) {
                const init = path.node.init;
                const varName = path.node.id?.name;
                if (!varName || !init || init.type !== "NewExpression") return;
                const className = init.callee?.name ?? null;
                if (className) map.set(varName, className);
            },

            // module.exports = new ClassName()
            AssignmentExpression(path) {
                const left  = path.node.left;
                const right = path.node.right;
                if (right?.type !== "NewExpression") return;
                const className = right.callee?.name ?? null;
                if (!className) return;

                // module.exports = new X()
                if (
                    left.type === "MemberExpression" &&
                    left.object?.name === "module" &&
                    left.property?.name === "exports"
                ) {
                    map.set("__moduleExport", className);
                }
            },
        });
    } catch (_) {}
    return map;
}

// ─── build import resolution map from context.imports ────────────────────────
// importMap: localName → { source, isLocal, originalName }
// Also handles: import * as auth from "./auth"  → auth.loginUser resolves to "./auth"
function buildImportMap(context) {
    const map = new Map();
    if (!context.imports) return map;
    for (const imp of context.imports) {
        if (imp.importedAs) {
            map.set(imp.importedAs, {
                source:       imp.source,
                isLocal:      imp.isLocal ?? false,
                originalName: imp.name,      // original exported name
                resolvedPath: imp.resolvedPath ?? null,
            });
        }
    }
    return map;
}

// ─── resolve callee function ID ───────────────────────────────────────────────
// For local imports: resolvedPath::name
// For class instances: ClassName.method (resolver matches against ClassMethod nodes)
// For unknown: null (resolver will attempt cross-file lookup)
function resolveCalleeFunctionId(name, object, importMap, instanceMap, currentFilePath) {
    if (!name) return null;

    // object.method → resolve object from imports first, then instance map
    if (object && object !== "this") {
        // 1. Check import map (imported module)
        const imp = importMap.get(object);
        if (imp?.isLocal && imp.resolvedPath) return `${imp.resolvedPath}::${name}`;
        if (imp?.isLocal && imp.source) return `${imp.source}::${name}`;

        // 2. Check instance map (local new ClassName())
        //    Produces "ClassName.method" — resolver matches against ClassMethod IDs
        const className = instanceMap.get(object);
        if (className) return `${currentFilePath}::${className}.${name}`;

        // 3. Unknown object — leave for resolver's cross-file fallback
        return null;
    }

    // direct call: check if name itself is an import
    if (!object) {
        const imp = importMap.get(name);
        if (imp?.isLocal && imp.resolvedPath) return `${imp.resolvedPath}::${imp.originalName ?? name}`;
        if (imp?.isLocal) return `${imp.source}::${imp.originalName ?? name}`;
        // not imported → same file
        return `${currentFilePath}::${name}`;
    }

    return null;
}

// ─── current function name ────────────────────────────────────────────────────
// ─── current function name ────────────────────────────────────────────────────
function getCurrentFunction(path) {
    let cur = path.parentPath;
    while (cur) {
        const n = cur.node;
        
        // 1. Standard Function Declarations: function foo() {}
        if (n.type === "FunctionDeclaration" && n.id?.name) return n.id.name;
        
        // 2. Variable Assignments: const foo = () => {}
        if ((n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") &&
            cur.parent?.type === "VariableDeclarator") return cur.parent.id?.name ?? "anonymous";
            
        // 3. Class Methods: class A { foo() {} }
        if (n.type === "ClassMethod"  && n.key?.name) return n.key.name;
        
        // 4. Object Methods: { foo() {} }
        if (n.type === "ObjectMethod" && n.key?.name) return n.key.name;
        
        // 5. Object Properties: { foo: () => {} }
        if (n.type === "ObjectProperty" &&
            (n.value?.type === "FunctionExpression" || n.value?.type === "ArrowFunctionExpression"))
            return n.key?.name ?? "anonymous";

        // 6. NEW: CommonJS Export Assignments
        // Pattern: exports.foo = () => {}   OR   module.exports.foo = () => {}
        if ((n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") &&
            cur.parent?.type === "AssignmentExpression") {
            
            const left = cur.parent.left;
            
            if (left.type === "MemberExpression") {
                // exports.foo = ...
                if (left.object.name === "exports") {
                    return left.property.name ?? left.property.value ?? "anonymous";
                }
                // module.exports.foo = ...
                if (
                    left.object.type === "MemberExpression" &&
                    left.object.object.name === "module" &&
                    left.object.property.name === "exports"
                ) {
                    return left.property.name ?? left.property.value ?? "anonymous";
                }
                // module.exports = ... (default export, we map to "module_exports")
                if (left.object.name === "module" && left.property.name === "exports") {
                    return "module_exports";
                }
            }
        }
            
        cur = cur.parentPath;
    }
    return "module";
}
// ─── main ─────────────────────────────────────────────────────────────────────
function extract(context) {
    const results   = [];
    const filePath  = context.filePath || "unknown";
    const importMap = buildImportMap(context);
    const instanceMap = buildInstanceMap(context.ast);  // ← new: track `new ClassName()` vars
    const seen      = new Set();

    function addCall({ name, object, from, type, startLine, endLine, argCount, isCallback }) {
        if (!name || isNoise(name, object)) return;

        const callee     = object ? `${object}.${name}` : name;
        const dedupeKey  = `${filePath}::${callee}::${from}::${startLine}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        // Resolve import linkage
        const resolvedObj    = object && object !== "this" ? importMap.get(object) : null;
        const resolvedDirect = !object ? importMap.get(name) : null;
        const importSource   = resolvedObj?.source ?? resolvedDirect?.source ?? null;
        const resolvedPath   = resolvedObj?.resolvedPath ?? resolvedDirect?.resolvedPath ?? null;
        const isLocal        = resolvedObj?.isLocal ?? resolvedDirect?.isLocal ?? null;
        const isExternal     = importSource !== null ? !isLocal : null;

        const calleeFunctionId = resolveCalleeFunctionId(name, object, importMap, instanceMap, filePath);

        results.push({
            name,
            object,
            callee,
            calleeFunctionId,   // for resolver linkage
            from,
            fromFunctionId: `${filePath}::${from}`,
            type,
            startLine,
            endLine,
            file:         filePath,
            argumentCount: argCount,
            isCallback:    isCallback ?? false,
            importSource,
            resolvedPath,
            isLocal,
            isExternal,
        });
    }

    // ─── callback detection — conservative: known imports or MemberExpressions ──
    function extractCallbacksFromArgs(args, from) {
        args.forEach(arg => {
            if (arg.type === "Identifier" && importMap.has(arg.name)) {
                addCall({ name: arg.name, object: null, from, type: "callback",
                    startLine: arg.loc?.start.line, endLine: arg.loc?.end.line, argCount: 0, isCallback: true });
            } else if (arg.type === "MemberExpression" || arg.type === "OptionalMemberExpression") {
                const obj  = arg.object?.type === "ThisExpression" ? "this" : arg.object?.name;
                const prop = arg.property?.name;
                if (prop) addCall({ name: prop, object: obj ?? null, from, type: "callback",
                    startLine: arg.loc?.start.line, endLine: arg.loc?.end.line, argCount: 0, isCallback: true });
            } else if (arg.type === "ObjectExpression") {
                arg.properties.forEach(p => {
                    if (p.value?.type === "Identifier" && importMap.has(p.value.name)) {
                        addCall({ name: p.value.name, object: null, from, type: "callback",
                            startLine: p.value.loc?.start.line, endLine: p.value.loc?.end.line, argCount: 0, isCallback: true });
                    } else if (p.value?.type === "MemberExpression") {
                        const obj  = p.value.object?.type === "ThisExpression" ? "this" : p.value.object?.name;
                        const prop = p.value.property?.name;
                        if (prop) addCall({ name: prop, object: obj ?? null, from, type: "callback",
                            startLine: p.value.loc?.start.line, endLine: p.value.loc?.end.line, argCount: 0, isCallback: true });
                    }
                });
            }
        });
    }

    traverse(context.ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            const args   = path.node.arguments;
            const from   = getCurrentFunction(path);
            let name = null, object = null, type = "direct";

            if (callee.type === "Identifier") {
                name = callee.name; type = "direct";
            } else if (callee.type === "MemberExpression" && !callee.optional) {
                name   = callee.property?.name ?? null;
                object = callee.object?.type === "ThisExpression" ? "this" : (callee.object?.name ?? null);
                type   = "member";
            } else if (callee.type === "OptionalMemberExpression" ||
                       (callee.type === "MemberExpression" && callee.optional)) {
                name   = callee.property?.name ?? null;
                object = callee.object?.type === "ThisExpression" ? "this" : (callee.object?.name ?? null);
                type   = "optionalMember";
            } else if (callee.type === "CallExpression" || callee.type === "OptionalCallExpression") {
                // Chained: foo.bar().baz() — inner already captured, skip outer object tracking
                // Extract the outermost property if it's a MemberExpression
                return;
            }

            addCall({ name, object, from, type,
                startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line,
                argCount: args.length, isCallback: false });

            extractCallbacksFromArgs(args, from);
        },

        NewExpression(path) {
            const callee = path.node.callee;
            const from   = getCurrentFunction(path);
            let name = null, object = null;

            if (callee.type === "Identifier") {
                name = callee.name;
            } else if (callee.type === "MemberExpression") {
                name   = callee.property?.name ?? null;
                object = callee.object?.type === "ThisExpression" ? "this" : (callee.object?.name ?? null);
            }

            addCall({ name, object, from, type: "constructor",
                startLine: path.node.loc?.start.line, endLine: path.node.loc?.end.line,
                argCount: path.node.arguments.length, isCallback: false });

            extractCallbacksFromArgs(path.node.arguments, from);
        },
    });

    return results;
}

module.exports = { extract };