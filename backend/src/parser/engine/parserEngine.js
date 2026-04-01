/**
 * parserEngine.js (TypeScript Compiler API Version)
 *
 * Industry-grade pipeline:
 * analyzeProject → ts.createProgram → parallel extractors → collector
 *
 * Features:
 * ✅ Whole-Project Context    (Replaces file-by-file Babel parsing)
 * ✅ Native TypeChecker       (Replaces custom import/instance mapping)
 * ✅ Parallel execution       (Promise.allSettled — no blocking)
 * ✅ Per-extractor isolation  (one crash ≠ whole file fails)
 * ✅ Structured diagnostics   (errors surfaced, never silently swallowed)
 */

const ts = require("typescript");
const { createCollector } = require("./collector");

// ─── Extractor registry ───────────────────────────────────────────────────────
// We will uncomment these as we rewrite them to use TypeScript.
const functionsExtractor = require("../extractors/functions_extractor");
const callsExtractor     = require("../extractors/calls_extractor");
const apiCallsExtractor  = require("../extractors/apiCalls_extractor");
const routesExtractor    = require("../extractors/routes_extractor");
const eventsExtractor    = require("../extractors/events_extractor");

// Notice: STAGE_1 (imports_extractor) is completely gone. 
// TypeScript resolves all imports natively during createProgram.
const EXTRACTORS = [
    { name: "functions", extractor: functionsExtractor, add: "addFunction" },
    { name: "calls",     extractor: callsExtractor,     add: "addCall"     },
    { name: "apiCalls",  extractor: apiCallsExtractor,  add: "addApiCall"  },
    { name: "routes",    extractor: routesExtractor,    add: "addRoute"    },
    { name: "events",    extractor: eventsExtractor,    add: "addEvent"    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely runs a single extractor.
 * Returns { name, results, error } — never throws.
 */
async function runExtractor({ name, extractor, add }, context, collector) {
    try {
        const results = await Promise.resolve(extractor.extract(context));
        if (!Array.isArray(results)) {
            throw new TypeError(`Extractor "${name}" must return an array, got ${typeof results}`);
        }
        results.forEach((entry) => collector[add](entry));
        return { name, count: results.length, error: null };
    } catch (err) {
        // Isolated — other extractors keep running
        return { name, count: 0, error: err.message ?? String(err) };
    }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Parses the entire project upfront and extracts data from every file.
 *
 * @param {string[]} filePaths - Array of absolute paths to all JS/TS files in the repo
 * @param {object}   [options] - Optional TS compiler options overrides
 * @returns {Map<string, object>} - Map of filePath -> Collected data + metadata
 */
async function analyzeProject(filePaths, options = {}) {
    const startedAt = Date.now();
    const allCollectedData = new Map();

    _log("info", "Global", `Initializing TypeScript Compiler for ${filePaths.length} files...`);

    // ── 1. Create the Global TypeScript Program ───────────────────────────────
    // This replaces parseFile.js. It reads the files, handles encoding, builds ASTs, 
    // and links all cross-file imports and types automatically.
    const program = ts.createProgram(filePaths, {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,       // Crucial: analyze standard .js files too
        checkJs: true,       // Infer types in .js files via JSDoc/usage
        jsx: ts.JsxEmit.ReactJSX,
        ...options
    });

    // ── 2. The TypeChecker (The Brain) ────────────────────────────────────────
    // This replaces context.js. It allows extractors to ask "where did this come from?"
    const checker = program.getTypeChecker();

    // ── 3. Loop through files and extract ─────────────────────────────────────
    for (const sourceFile of program.getSourceFiles()) {
        // Skip TypeScript internal definitions and dependencies
        if (sourceFile.isDeclarationFile || sourceFile.fileName.includes("node_modules")) {
            continue;
        }

        const filePath = sourceFile.fileName;
        const collector = createCollector(filePath);
        
        // The new, significantly leaner context passed to extractors
        const context = {
            sourceFile,
            checker,
            filePath
        };

        const extractorMeta = [];

        // ── 4. Run Extractors (Parallel) ──────────────────────────────────────
        const stageResults = await Promise.allSettled(
            EXTRACTORS.map((descriptor) => runExtractor(descriptor, context, collector))
        );

        for (const settled of stageResults) {
            const meta = settled.status === "fulfilled"
                ? settled.value
                : { name: "unknown", count: 0, error: String(settled.reason) };

            extractorMeta.push(meta);
            if (meta.error) {
                _log("warn", filePath, `[${meta.name}] extractor error: ${meta.error}`);
            }
        }

        // ── 5. Assemble file result ───────────────────────────────────────────
        const collected = collector.getData();
        allCollectedData.set(filePath, {
            ...collected,
            _meta: {
                parsedAt:    new Date().toISOString(),
                fileExt:     filePath.split('.').pop(),
                extractors:  extractorMeta,
                summary:     collector.getSummary(),
            },
        });
    }

    _log("info", "Global", `Analysis complete in ${Date.now() - startedAt}ms`);
    return allCollectedData;
}

// ─── Internal logger ──────────────────────────────────────────────────────────
function _log(level, file, message) {
    const prefix = `[parserEngine][${level.toUpperCase()}] ${file}:`;
    if (level === "error") console.error(prefix, message);
    else if (level === "info") console.log(prefix, message);
    else console.warn(prefix, message);
}

module.exports = { analyzeProject };