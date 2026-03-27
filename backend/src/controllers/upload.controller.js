const { fetchRepoAsZip } = require("../utils/githubZipHandler");

async function uploadRepo(req, res) {
    try {
        const { repoUrl } = req.body;

        // 1. Validate the input
        if (!repoUrl) {
            return res.status(400).json({ 
                success: false, 
                error: "repoUrl is required" 
            });
        }

        console.log("📥 Incoming repo processing:", repoUrl);

        // 2. Fetch + Extract repo
        const repoPath = await fetchRepoAsZip(repoUrl);

        console.log("📂 Repo successfully extracted at:", repoPath);

        // 3. Return success and the path
        // The frontend or next middleware can now use this path for the analyzer
        return res.status(200).json({
            success: true,
            message: "Repository downloaded and extracted successfully.",
            repoPath: repoPath,
        });

    } catch (error) {
        console.error("❌ Upload error:", error.message);

        // Send a clearer message if it's the GitHub 404 issue we saw earlier
        if (error.message.includes("404")) {
            return res.status(404).json({
                success: false,
                error: "Repository not found. It might be private or the URL is incorrect."
            });
        }

        // Generic fallback error
        return res.status(500).json({
            success: false,
            error: "Failed to download repository.",
            details: error.message
        });
    }
}

module.exports = { uploadRepo };
