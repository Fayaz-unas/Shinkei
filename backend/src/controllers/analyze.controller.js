const { fetchRepoAsZip } = require("../utils/githubZipHandler");

async function analyzeRepo(req, res) {
    try {
        const { repoUrl } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ error: "repoUrl is required" });
        }

        console.log("📥 Incoming repo:", repoUrl);

        // 🔥 Step 1: Fetch + Extract repo
        const repoPath = await fetchRepoAsZip(repoUrl);

        console.log("📂 Repo ready at:", repoPath);

        // 👉 For now just return path (later → analyzer)
        return res.json({
            success: true,
            repoPath,
        });

    } catch (error) {
        console.error("❌ Analyze error:", error.message);

        return res.status(500).json({
            error: "Failed to analyze repo",
        });
    }
}

module.exports = { analyzeRepo };
