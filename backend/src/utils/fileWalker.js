const fs   = require("fs");
const path = require("path");

const SUPPORTED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];

const IGNORE_DIRS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
    "public",
    ".cache",
];

function fileWalker(dir, results = []) {
    let entries;

    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        console.warn(`[fileWalker] Cannot read dir: ${dir}`);
        return results;
    }

    for (const entry of entries) {
        if (IGNORE_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            fileWalker(fullPath, results);
        } else if (entry.isFile()) {
            if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name))) {
                results.push(fullPath);
            }
        }
    }

    return results;
}

module.exports = { fileWalker };
