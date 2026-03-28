const { fetchRepoAsZip } = require("../utils/githubZipHandler");

/**
 * analyze.controller.js
 *
 * Handles POST /analyze
 *
 * Request body:
 *  {
 *    repoUrl:       string   — GitHub repo URL (required)
 *    entryFunction: string   — function name to start from (required)
 *    direction:     string   — "forward" | "backward" (optional, default: "forward")
 *    depth:         number   — max traversal depth (optional, default: 8 forward / 4 backward)
 *  }
 */

exports.analyzeRepo = async (req, res) => {
    try {
        const { repoUrl, entryFunction, direction, depth } = req.body;

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

        // Fix 5: validate direction input — prevent invalid values
        const directionSafe = direction === "backward" ? "backward" : "forward";

        // Fix 2: parse depth — must be a positive number if provided
        const depthSafe = depth && Number.isInteger(Number(depth)) && Number(depth) > 0
            ? Number(depth)
            : null; // null → analyzer uses its own defaults (8 forward / 4 backward)

        console.log("[analyze] repo      :", repoUrl);
        console.log("[analyze] entry     :", entryFunction);
        console.log("[analyze] direction :", directionSafe);
        console.log("[analyze] depth     :", depthSafe ?? "default");

        // ── step 1: download + extract repo ───────────────────────────────
        const repoPath = await fetchRepoAsZip(repoUrl);
        console.log("[analyze] path      :", repoPath);

        // ── step 2: build global index ────────────────────────────────────
        globalIndex.build(repoPath);

        // ── step 3: analyze — Fix 1: use analyzeFunction not trace() ──────
        const result = globalIndex.analyzeFunction(
            entryFunction,
            directionSafe,
            depthSafe,
        );

        // Fix 4: check for error field (handles both forward + backward)
        if (!result || result.error) {
            return res.status(404).json({
                success: false,
                error: result?.error ?? `Could not analyze "${entryFunction}".`,
            });
        }

        // ── log result summary ────────────────────────────────────────────
        console.log("[analyze] steps     :", result.stats?.steps ?? result.stats?.totalCallers);
        console.log("[analyze] functions :", result.stats?.functions ?? result.stats?.totalCallers);
        console.log("[analyze] api calls :", result.stats?.apiCalls ?? 0);
        console.log("[analyze] external  :", result.stats?.external ?? 0);   // Fix 3: removed memberCalls
        console.log("[analyze] events    :", result.stats?.events ?? 0);
        console.log("[analyze] nodes     :", result.fullGraph?.nodes?.length ?? 0);
        console.log("[analyze] edges     :", result.fullGraph?.edges?.length ?? 0);

        return res.json({ success: true, ...result });

    } catch (err) {
        console.error("[analyze] crash:", err.message);

        if (err.message?.includes("404")) {
            return res.status(404).json({
                success: false,
                error: "Repository not found. Check the URL or make sure it is public.",
            });
        }

        return res.status(500).json({
            error: "Failed to analyze repo",
        });
    }
};
