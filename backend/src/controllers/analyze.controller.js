const { fetchRepoAsZip } = require("../utils/githubZipHandler");
const globalIndex        = require("../services/analyzer.service");

exports.analyzeRepo = async (req, res) => {
    try {
        const { repoUrl, entryFunction } = req.body;

        // ── validation ────────────────────────────────────────────────────
        if (!repoUrl) {
            return res.status(400).json({
                success: false,
                error: "repoUrl is required.",
            });
        }
        if (!entryFunction) {
            return res.status(400).json({
                success: false,
                error: "entryFunction is required.",
            });
        }

        console.log("[analyze] repo  :", repoUrl);
        console.log("[analyze] entry :", entryFunction);

        // ── step 1: download + extract — once ─────────────────────────────
        const repoPath = await fetchRepoAsZip(repoUrl);
        console.log("[analyze] path  :", repoPath);

        // ── step 2: index all files ────────────────────────────────────────
        globalIndex.build(repoPath);

        // ── step 3: trace from entry ───────────────────────────────────────
        const result = globalIndex.trace(entryFunction);

        if (!result || result.flow.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Could not trace from "${entryFunction}". Is it defined in this repo?`,
            });
        }

        console.log("[analyze] steps      :", result.stats.steps);
        console.log("[analyze] functions  :", result.stats.functions);
        console.log("[analyze] api calls  :", result.stats.apiCalls);
        console.log("[analyze] member calls:", result.stats.memberCalls);
        console.log("[analyze] events     :", result.stats.events);
        console.log("[analyze] nodes      :", result.fullGraph.nodes.length);
        console.log("[analyze] edges      :", result.fullGraph.edges.length);

        return res.json({ success: true, ...result });

    } catch (err) {
        console.error("[analyze] crash:", err.message);

        if (err.message.includes("404")) {
            return res.status(404).json({
                success: false,
                error: "Repository not found. Check the URL or make sure it is public.",
            });
        }

        return res.status(500).json({
            success: false,
            error:   "Internal analysis error.",
            details: err.message,
        });
    }
};
