const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const AdmZip = require("adm-zip");
const { execSync } = require("child_process");

// Import the execution engine
const { runDynamicEnvironment, stopActiveProcesses } = require("./dynamicLauncher");

const TEMP_DIR = path.join(__dirname, "../../temp");

function parseRepoUrl(url) {
    try {
        let validUrl = url;
        if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
            validUrl = 'https://' + validUrl;
        }

        const urlObj = new URL(validUrl);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        
        const owner = pathParts[0] || 'unknown';
        const repo = pathParts[1] ? pathParts[1].replace('.git', '') : 'repo-' + Date.now();
        
        return { 
            host: urlObj.host, 
            hostname: urlObj.hostname,
            owner, 
            repo 
        };
    } catch (e) {
        return { host: 'local', hostname: 'local', owner: 'local', repo: 'project-' + Date.now() };
    }
}

function getZipUrl(url) {
    const { hostname, owner, repo } = parseRepoUrl(url);
    
    if (hostname.includes('gitlab.com')) {
        return `https://gitlab.com/${owner}/${repo}/-/archive/master/${repo}-master.zip`;
    }
    if (hostname.includes('bitbucket.org')) {
        return `https://bitbucket.org/${owner}/${repo}/get/master.zip`;
    }

    return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
}

async function resolveZipUrl(url) {
    const { hostname, owner, repo } = parseRepoUrl(url);

    if (hostname.includes('gitlab.com') || hostname.includes('bitbucket.org')) {
        return getZipUrl(url);
    }

    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'shinkei-repo-fetcher'
    };

    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    try {
        const repoMeta = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        const defaultBranch = repoMeta?.data?.default_branch || 'main';
        return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${defaultBranch}`;
    } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
            throw new Error("Repository not found on GitHub. Verify owner/repo and try again.");
        }
        
        // If 401/403 (Rate limited or private metadata), try fallback to 'main' 
        // codeload might still work for public repos even if API is rate limited
        console.warn(`[Shinkei] GitHub API metadata fetch failed (${status}). Falling back to 'main' branch.`);
        return `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
    }
}

async function downloadZip(url, dest) {
    const headers = {
        'User-Agent': 'shinkei-repo-fetcher'
    };

    if (process.env.GITHUB_TOKEN && url.includes('github.com')) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const res = await axios({ 
        method: 'GET', 
        url, 
        responseType: 'stream',
        headers
    });
    
    const writer = fs.createWriteStream(dest);
    res.data.pipe(writer);
    return new Promise((rs, rj) => { 
        writer.on('finish', rs); 
        writer.on('error', rj); 
    });
}

async function clearTempFolder() {
    if (await fs.pathExists(TEMP_DIR)) {
        await fs.emptyDir(TEMP_DIR);
    }
}

async function fetchRepoAsZip(repoUrl, runDynamic = false, options = {}) {
    const { repo } = parseRepoUrl(repoUrl);
    const uniqueId = Date.now();
    
    await fs.ensureDir(TEMP_DIR);
    
    const extractPath = path.join(TEMP_DIR, `${repo}-${uniqueId}`);
    const zipPath = path.join(TEMP_DIR, `${repo}-${uniqueId}.zip`);

    try {
        const zipUrl = await resolveZipUrl(repoUrl);
        await downloadZip(zipUrl, zipPath);
    } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
            throw new Error("Repository not found on GitHub. Verify owner/repo and try again.");
        }
        if (status === 401 || status === 403) {
            throw new Error("Repository exists but is not accessible (private or rate-limited).");
        }
        throw new Error(`Failed to download repository archive: ${err.message}`);
    }
    
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    const folders = await fs.readdir(extractPath);
    const repoRoot = path.join(extractPath, folders[0]);

    // Husky/Git workaround
    try {
        execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
        console.log("✅ [Shinkei] Initialized dummy .git repo to satisfy Husky.");
    } catch (e) {
        console.warn("⚠️ [Shinkei] Could not run git init. Husky installs may fail.");
    }

    // Call the newly separated Launcher Engine
    if (runDynamic) {
        runDynamicEnvironment(repoRoot, options).catch(console.error);
    }

    return repoRoot;
}

// Re-export stopActiveProcesses so your routes don't break
module.exports = { fetchRepoAsZip, clearTempFolder, stopActiveProcesses };