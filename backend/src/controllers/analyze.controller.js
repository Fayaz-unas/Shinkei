const { fetchRepoAsZip } = require("../utils/githubZipHandler");
const globalIndex = require("../services/analyzer.service.js");

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
        const depthSafe = depth && Number.isInteger(Number(depth)) && Number(depth) > 0
            ? Number(depth)
            : null;

        const repoPath = await fetchRepoAsZip(repoUrl);
        globalIndex.build(repoPath);

        const result = globalIndex.analyzeFunction(
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

        // ── NEW FILTER LOGIC ──────────────────────────────────────────────
        
        // 1. Get raw nodes/edges
        const rawNodes = result.nodes || result.fullGraph?.nodes || [];
        const rawEdges = result.edges || result.fullGraph?.edges || [];

        // 2. Filter out 'member' type nodes (internal object calls like console.log)
        const filteredNodes = rawNodes.filter(n => n.type !== 'member');
        const validNodeIds = new Set(filteredNodes.map(n => n.id));

        // 3. Keep only edges where both ends exist after filtering
        const filteredEdges = rawEdges.filter(
            e => validNodeIds.has(e.from) && validNodeIds.has(e.to)
        );

        // 4. Update the sequential flow list as well
        const filteredFlow = (result.flow || []).filter(step => step.type !== 'member');

        // ── FORMATTER HELPER ──────────────────────────────────────────────
        
        const formatToNumericFlow = (nodes, edges) => {
            const getId = (idStr) => {
                if (typeof idStr === 'number') return idStr;
                return parseInt(idStr.toString().replace('node_', ''), 10);
            };

            return {
                root: 0,
                nodes: nodes.map(n => ({ ...n, id: getId(n.id) })),
                edges: edges.map(e => ({ from: getId(e.from), to: getId(e.to) }))
            };
        };

        const numericFlow = formatToNumericFlow(filteredNodes, filteredEdges);

        // ── FINAL RESPONSE ────────────────────────────────────────────────
        
        return res.json({ 
            success: true, 
            flow: numericFlow, // This is what SHINKEI UI uses for the graph
            trace: filteredFlow, // The step-by-step list
            stats: {
                ...result.stats,
                memberCalls: 0 // Resetting since they are filtered out
            }
        });

    } catch (err) {
        console.error("[analyze] crash:", err.message);
        return res.status(500).json({
            success: false,
            error: "Failed to analyze repo: " + err.message,
        });
    }
};
