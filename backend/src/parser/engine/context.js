class ParserContext {
    constructor(ast, filePath) {
        this.ast = ast;
        this.filePath = filePath;
        this.fileName = require("path").basename(filePath);
    }
}

module.exports = { ParserContext };
