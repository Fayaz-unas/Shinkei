// backend/src/services/editor.service.js
const fs = require('fs-extra');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

exports.readTargetFile = async (filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        throw new Error(`Could not read file at ${filePath}`);
    }
};

exports.extractDesignSnippet = async (filePath, targetLine) => {
  const code = await fs.readFile(filePath, 'utf8');
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"]
  });

  let snippet = null;
  let range = null;
  let snippetStartLine = 1;

  traverse(ast, {
    JSXElement(path) {
      const { start, end } = path.node.loc;
      if (targetLine >= start.line && targetLine <= end.line) {
        if (!snippet) { // Get the topmost JSX element for this line
          snippet = code.substring(path.node.start, path.node.end);
          range = { start: path.node.start, end: path.node.end };
          snippetStartLine = start.line;
        }
      }
    }
  });

  if (!snippet) {
    return {
      snippet: code,
      range: null,
      snippetStartLine: 1,
      fullContent: code,
    };
  }

  return { snippet, range, snippetStartLine, fullContent: code };
};

exports.writeTargetFile = async (filePath, newContent, repoRoot, range = null) => {
    const absolutePath = path.resolve(filePath);
    const absoluteRepoRoot = path.resolve(repoRoot);

    if (!absolutePath.startsWith(absoluteRepoRoot)) {
        throw new Error("Security Violation: Attempted to write outside the target repository.");
    }

    try {
        if (range) {
          const fullContent = await fs.readFile(absolutePath, 'utf8');
          const updatedContent = 
            fullContent.substring(0, range.start) + 
            newContent + 
            fullContent.substring(range.end);
          await fs.writeFile(absolutePath, updatedContent, 'utf8');
        } else {
          await fs.writeFile(absolutePath, newContent, 'utf8');
        }
        return true;
    } catch (error) {
        throw new Error(`Could not save file to ${filePath}`);
    }
};