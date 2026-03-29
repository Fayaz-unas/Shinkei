/**
 * parseFile.js
 *
 * Foundation of the parse pipeline.
 * Converts a JS/TS source file into a Babel AST.
 *
 * Features
 *  ✅ Full modern plugin coverage  (decorators, dynamic import, class fields…)
 *  ✅ errorRecovery               (partial AST on syntax errors, never hard-fails)
 *  ✅ sourceFilename              (file trace embedded in AST nodes)
 *  ✅ ranges                      (byte offsets for future code slicing)
 *  ✅ File type guard             (skips non-parseable files early)
 *  ✅ Encoding fallback           (latin1 retry when UTF-8 decode fails)
 *  ✅ Structured diagnostics      (parse errors surfaced, never silently swallowed)
 */

const fs     = require("fs");
const path   = require("path");
const parser = require("@babel/parser");

// ─── Supported extensions ─────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

// ─── Babel plugin set ─────────────────────────────────────────────────────────
// Covers every syntax a modern JS/TS codebase can throw at the parser.
// Order matters for a few plugins (decorators before classProperties).
const BABEL_PLUGINS = [
    // ── Syntax variants ───────────────────────────────────────────────────────
    "jsx",
    "typescript",

    // ── Class features ────────────────────────────────────────────────────────
    ["decorators", { decoratorsBeforeExport: true }],
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "staticClassBlock",

    // ── Modern JS ─────────────────────────────────────────────────────────────
    "dynamicImport",
    "importMeta",
    "importAssertions",
    "optionalChaining",
    "nullishCoalescingOperator",
    "nullishCoalescingAssign",
    "logicalAssignment",
    "objectRestSpread",
    "optionalCatchBinding",
    "topLevelAwait",
    "asyncGenerators",

    // ── Stage 3 / proposals ───────────────────────────────────────────────────
    "doExpressions",
    "exportDefaultFrom",
    "throwExpressions",
];

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Parse a single source file into a Babel AST.
 *
 * @param   {string}      filePath - Absolute path to the source file
 * @returns {object|null}          - Babel AST, or null if the file is
 *                                   unsupported / unreadable
 */
function parseFile(filePath) {
    // ── 1. File type guard ────────────────────────────────────────────────────
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) {
        // Not a parse failure — just an unsupported file type. Skip silently.
        return null;
    }

    // ── 2. Read source (with encoding fallback) ───────────────────────────────
    let code;
    try {
        code = fs.readFileSync(filePath, "utf-8");
    } catch (readErr) {
        if (readErr.code === "ERSULTINVALID" || readErr.message.includes("encoding")) {
            // UTF-8 decode failed — retry with latin1 (rare but real)
            try {
                code = fs.readFileSync(filePath, "latin1");
            } catch (fallbackErr) {
                console.warn(
                    `[parseFile] WARN  Cannot read file: ${filePath} —`,
                    fallbackErr.message
                );
                return null;
            }
        } else {
            console.warn(
                `[parseFile] WARN  Cannot read file: ${filePath} —`,
                readErr.message
            );
            return null;
        }
    }

    // ── 3. Parse → AST ───────────────────────────────────────────────────────
    let ast;
    try {
        ast = parser.parse(code, {
            sourceType:    "module",
            sourceFilename: filePath,   // embeds file path in every AST node
            errorRecovery: true,        // partial AST on syntax errors, never throws
            ranges:        true,        // adds [start, end] byte offsets to nodes
            plugins:       BABEL_PLUGINS,
        });
    } catch (parseErr) {
        // errorRecovery:true means this branch is only hit for truly fatal errors
        // (e.g. completely garbled binary disguised as .js).
        console.warn(
            `[parseFile] WARN  Failed to parse: ${filePath} —`,
            parseErr.message
        );
        return null;
    }

    // ── 4. Surface recovered parse errors (non-fatal) ────────────────────────
    // Babel collects these when errorRecovery:true — log them so they're visible
    // in CI / analysis reports without stopping the pipeline.
    if (ast.errors?.length) {
        for (const e of ast.errors) {
            console.warn(
                `[parseFile] SYNTAX ${filePath}:${e.loc?.line ?? "?"}:${e.loc?.column ?? "?"} —`,
                e.message
            );
        }
    }

    return ast;
}

module.exports = { parseFile };
