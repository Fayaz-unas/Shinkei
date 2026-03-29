const { fetchRepoAsZip } = require("../utils/githubZipHandler");

// ── NEW ARCHITECTURE IMPORTS ──────────────────────────────────────
// Replacing the deprecated analyzer.service.js monolith
const { index } = require("../services/indexBuilder"); 
const { analyzeFunction } = require("../services/queryEngine");

exports.analyzeRepo = async (req, res) => {
    try {
        const { repoUrl, entryFunction, direction, depth } = req.body;

        if (!repoUrl || !entryFunction) {
            return res.status(400).json({
                success: false,
                error: "repoUrl and entryFunction are required.",
            });
        }

        const directionSafe = direction === "backward" ? "backward" : "forward";
        const depthSafe = (depth && Number.isInteger(Number(depth)) && Number(depth) > 0)
            ? Number(depth)
            : null;

        const repoPath = await fetchRepoAsZip(repoUrl);
        
        // 1. BUILD STEP: Delegate to indexBuilder
        // TODO (Future): Implement caching to avoid rebuilding per request
         await index.build(repoPath);

        // 2. ANALYZE STEP: Delegate to queryEngine
        const result = analyzeFunction(
            entryFunction,
            directionSafe,
            depthSafe
        );

        if (!result || result.error) {
            return res.status(404).json({
                success: false,
                error: result?.error ?? `Could not analyze "${entryFunction}".`,
            });
        }

        // ── FORMATTER HELPER ──────────────────────────────────────────────
        const formatToNumericFlow = (nodes, edges) => {
            const idMap = new Map();
            let counter = 0;

            const getNumericId = (originalId) => {
                if (!idMap.has(originalId)) {
                    idMap.set(originalId, counter++);
                }
                return idMap.get(originalId);
            };

            return {
                root: 0,
                nodes: nodes.map(n => ({
                    ...n,
                    originalId: n.id,   // preserve string ID; numeric id is for graph rendering only
                    id: getNumericId(n.id),
                })),
                edges: edges.map(e => ({
                    from: getNumericId(e.from),
                    to:   getNumericId(e.to),
                })),
            };
        };

        const numericFlow = formatToNumericFlow(result.fullGraph.nodes, result.fullGraph.edges);

        // ── FINAL RESPONSE ────────────────────────────────────────────────
        return res.json({ 
            success: true, 
            flow: numericFlow, 
            trace: result.flow, 
            stats: result.stats 
        });

    } catch (err) {
        console.error("[analyze] crash:", err.message);
        return res.status(500).json({
            success: false,
            error: "Failed to analyze repo: " + err.message,
        });
    }
};