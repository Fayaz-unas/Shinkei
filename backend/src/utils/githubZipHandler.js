const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const AdmZip = require("adm-zip");
const TEMP_DIR = path.join(__dirname, "../../temp");

/**
 * Extract owner + repo from URL
 */
function parseRepoUrl(repoUrl) {
    const cleanUrl = repoUrl.replace(".git", "");
    const parts = cleanUrl.split("/");

    return {
        owner: parts[3],
        repo: parts[4],
    };
}

/**
 * Generate ZIP URL (default branch = main)
 */
function getZipUrl(repoUrl) {
    const { owner, repo } = parseRepoUrl(repoUrl);
    
    // 💡 This "legacy" URL format automatically redirects 
    // to the default branch's ZIP archive on GitHub.
    return `https://github.com/${owner}/${repo}/zipball/master`;
}

/**
 * Download ZIP file
 */
async function downloadZip(zipUrl, outputPath) {
    const response = await axios({
        method: "GET",
        url: zipUrl,
        responseType: "stream",
    });

    const writer = fs.createWriteStream(outputPath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

/**
 * Extract ZIP file
 */
function extractZip(zipPath, extractTo) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTo, true);
}

/**
 * Main function: Download + Extract repo
 */
async function fetchRepoAsZip(repoUrl) {
    try {
        const { repo } = parseRepoUrl(repoUrl);
        const uniqueId = Date.now();

        const tempDir = path.join(__dirname, "../../temp");
        await fs.ensureDir(tempDir);

        const zipPath = path.join(tempDir, `${repo}-${uniqueId}.zip`);
        const extractPath = path.join(tempDir, `${repo}-${uniqueId}`);

        const zipUrl = getZipUrl(repoUrl);

        console.log("⬇️ Downloading ZIP:", zipUrl);

        await downloadZip(zipUrl, zipPath);

        console.log("📦 Extracting ZIP...");

        extractZip(zipPath, extractPath);

        // GitHub ZIP creates nested folder: repo-main/
        const extractedFolders = await fs.readdir(extractPath);
        const repoRoot = path.join(extractPath, extractedFolders[0]);

        console.log("✅ Repo ready at:", repoRoot);

        return repoRoot;

    } catch (err) {
        console.error("❌ ZIP fetch failed:", err.message);
        throw err;
    }
}
async function clearTempFolder() {
    try {
        if (await fs.pathExists(TEMP_DIR)) {
            console.log("🧹 Clearing temp folder...");

            await fs.emptyDir(TEMP_DIR); // 🔥 this deletes everything inside but keeps folder

            console.log("✅ Temp folder is clean");
        } else {
            await fs.ensureDir(TEMP_DIR);
            console.log("📁 Temp folder created");
        }
    } catch (err) {
        console.error("❌ Failed to clear temp:", err.message);
    }
}

module.exports = {
    fetchRepoAsZip,
    clearTempFolder
};
