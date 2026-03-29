/**
 * parserEngine.js
 *
 * Industry-grade pipeline:
 *   parseFile → ParserContext → parallel extractors (ordered) → collector
 *
 * Features
 *  ✅ Correct extractor order  (imports first → calls can use shared map)
 *  ✅ Parallel execution       (Promise.allSettled — no blocking)
 *  ✅ Per-extractor isolation  (one crash ≠ whole file fails)
 *  ✅ Structured error logging (never silent)
 *  ✅ Parse metadata           (timing, file type, content hash)
 *  ✅ Config forwarding        (options passed into context)
 */

const { parseFile }       = require("../parseFile");
const { ParserContext }   = require("./context");
const { createCollector } = require("./collector");

const functionsExtractor = require("../extractors/functions_extractor");
const callsExtractor     = require("../extractors/calls_extractor");
const apiCallsExtractor  = require("../extractors/apiCalls_extractor");
const routesExtractor    = require("../extractors/routes_extractor");
const eventsExtractor    = require("../extractors/events_extractor");
const importsExtractor   = require("../extractors/imports_extractor");

// ─── Extractor registry ───────────────────────────────────────────────────────
// ORDER MATTERS: imports must run first so context.getImportMap() is warm
// before calls / apiCalls try to use it.
//
// Stage 1 — runs sequentially first (builds shared maps)
// Stage 2 — runs in parallel (independent of each other)

const STAGE_1 = [
    { name: "imports",   extractor: importsExtractor,   add: "addImport"   },
];

const STAGE_2 = [
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
 * Parses a single file and returns a structured result.
 *
 * @param {string} filePath  - Absolute path to the JS/TS file
 * @param {object} [options] - Pipeline config forwarded to ParserContext
 * @returns {object|null}    - Collected data + metadata, or null on parse failure
 */
async function runParser(filePath, options = {}) {
    const startedAt = Date.now();

    // ── 1. Parse file → AST ───────────────────────────────────────────────────
    let ast;
    try {
        ast = parseFile(filePath);
    } catch (err) {
        _log("error", filePath, `AST parse failed: ${err.message}`);
        return null;
    }

    if (!ast) {
        _log("error", filePath, "parseFile returned null — skipping file");
        return null;
    }

    // ── 2. Build shared context + collector ───────────────────────────────────
    const context   = new ParserContext(ast, filePath, options);
    const collector = createCollector(filePath);

    const extractorMeta = [];   // per-extractor diagnostics

    // ── 3. Stage 1: sequential (warms shared maps e.g. importMap) ────────────
    for (const descriptor of STAGE_1) {
        const meta = await runExtractor(descriptor, context, collector);
        extractorMeta.push(meta);
        if (meta.error) {
            _log("warn", filePath, `[${meta.name}] extractor error: ${meta.error}`);
        }
    }

    // Explicitly warm shared maps on context so Stage 2 extractors never
    // trigger lazy computation mid-parallel-batch (avoids race conditions
    // if extractors are ever made truly async).
    context.getImportMap();
    context.getFunctionMap();

    // ── 4. Stage 2: parallel (all independent of each other) ─────────────────
    const stage2Results = await Promise.allSettled(
        STAGE_2.map((descriptor) => runExtractor(descriptor, context, collector))
    );

    for (const settled of stage2Results) {
        // allSettled never rejects — but runExtractor already catches internally
        const meta = settled.status === "fulfilled"
            ? settled.value
            : { name: "unknown", count: 0, error: String(settled.reason) };

        extractorMeta.push(meta);
        if (meta.error) {
            _log("warn", filePath, `[${meta.name}] extractor error: ${meta.error}`);
        }
    }

    // ── 5. Assemble final result ──────────────────────────────────────────────
    const collected = collector.getData();

    return {
        ...collected,

        // ── Metadata block ────────────────────────────────────────────────────
        _meta: {
            parsedAt:    new Date().toISOString(),
            durationMs:  Date.now() - startedAt,
            contentHash: context.contentHash,
            fileExt:     context.fileExt,
            extractors:  extractorMeta,          // per-extractor counts + errors
            summary:     collector.getSummary(),  // { functions: N, calls: N, … }
        },
    };
}

// ─── Internal logger ──────────────────────────────────────────────────────────
function _log(level, file, message) {
    const prefix = `[parserEngine][${level.toUpperCase()}] ${file}:`;
    if (level === "error") console.error(prefix, message);
    else                   console.warn(prefix, message);
}

module.exports = { runParser };
