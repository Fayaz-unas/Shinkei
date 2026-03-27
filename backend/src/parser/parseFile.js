const fs     = require("fs");
const parser = require("@babel/parser");

function parseFile(filePath) {
    try {
        const code = fs.readFileSync(filePath, "utf-8");

        return parser.parse(code, {
            sourceType: "module",
            plugins: ["jsx", "typescript"],
        });
    } catch (err) {
        console.warn(`[parseFile] Failed to parse: ${filePath} —`, err.message);
        return null;
    }
}

module.exports = { parseFile };
