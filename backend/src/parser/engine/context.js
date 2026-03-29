/**
 * context.js
 * Shared parse context passed to every extractor.
 * Centralises repeated computation so extractors don't rebuild state.
 */

const path   = require("path");
const crypto = require("crypto");
const fs     = require("fs");

class ParserContext {
    /**
     * @param {object} ast        - Babel / acorn AST
     * @param {string} filePath   - Absolute path of the file being parsed
     * @param {object} [options]  - Optional config forwarded from the pipeline
     */
    constructor(ast, filePath, options = {}) {
        this.ast      = ast;
        this.filePath = filePath;
        this.fileName = path.basename(filePath);
        this.fileExt  = path.extname(filePath).toLowerCase();
        this.options  = Object.freeze({ ...options });

        // Raw source (needed for hashing + some extractors)
        this._source = this._readSource();

        // Content hash for caching / incremental analysis
        this.contentHash = this._source
            ? crypto.createHash("sha256").update(this._source).digest("hex")
            : null;

        // ── Shared maps (built once, reused by all extractors) ───────────────
        // Populated lazily via getImportMap() / getFunctionMap()
        this._importMap   = null;
        this._functionMap = null;
    }

    // ── Source ────────────────────────────────────────────────────────────────

    _readSource() {
        try {
            return fs.readFileSync(this.filePath, "utf8");
        } catch {
            return null;
        }
    }

    /** Raw file source, or null if unreadable. */
    get source() {
        return this._source;
    }

    // ── Shared import map ─────────────────────────────────────────────────────
    /**
     * Returns a Map<localName, sourceModule> built from the AST.
     * Computed once and cached — every extractor shares the same map.
     *
     * @returns {Map<string, string>}
     */
    getImportMap() {
        if (this._importMap) return this._importMap;

        const map = new Map();

        for (const node of this.ast.body ?? []) {
            // ESM:  import foo from './bar'
            if (node.type === "ImportDeclaration") {
                const source = node.source?.value;
                for (const spec of node.specifiers ?? []) {
                    map.set(spec.local?.name, source);
                }
            }

            // CJS:  const foo = require('./bar')
            if (
                node.type === "VariableDeclaration" &&
                node.declarations
            ) {
                for (const decl of node.declarations) {
                    const init = decl.init;
                    if (
                        init?.type === "CallExpression" &&
                        init.callee?.name === "require" &&
                        init.arguments?.[0]?.type === "StringLiteral"
                    ) {
                        const source = init.arguments[0].value;
                        // const { a, b } = require(...)
                        if (decl.id?.type === "ObjectPattern") {
                            for (const prop of decl.id.properties ?? []) {
                                map.set(prop.value?.name, source);
                            }
                        } else {
                            map.set(decl.id?.name, source);
                        }
                    }
                }
            }
        }

        this._importMap = map;
        return map;
    }

    // ── Shared function map ───────────────────────────────────────────────────
    /**
     * Returns a Map<functionName, ASTNode> for top-level functions.
     * Useful for calls extractor to resolve callee context.
     *
     * @returns {Map<string, object>}
     */
    getFunctionMap() {
        if (this._functionMap) return this._functionMap;

        const map = new Map();

        for (const node of this.ast.body ?? []) {
            // function foo() {}
            if (node.type === "FunctionDeclaration" && node.id?.name) {
                map.set(node.id.name, node);
            }
            // const foo = () => {}  |  const foo = function() {}
            if (node.type === "VariableDeclaration") {
                for (const decl of node.declarations ?? []) {
                    if (
                        decl.id?.name &&
                        (decl.init?.type === "ArrowFunctionExpression" ||
                         decl.init?.type === "FunctionExpression")
                    ) {
                        map.set(decl.id.name, decl.init);
                    }
                }
            }
        }

        this._functionMap = map;
        return map;
    }
}

module.exports = { ParserContext };
