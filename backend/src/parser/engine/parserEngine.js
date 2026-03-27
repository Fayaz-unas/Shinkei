const { parseFile } = require("../parseFile");
const { ParserContext } = require("./context");
const { collect } = require("./collector");

function runParser(filePath) {
    const ast = parseFile(filePath);
    if (!ast) return null;

    const context = new ParserContext(ast, filePath);
    return collect(context);
}

module.exports = { runParser };
