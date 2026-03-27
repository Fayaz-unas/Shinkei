const path = require("path");
const { fileWalker } = require("./src/services/fileWalker.services");
const { runParser }  = require("./src/parser/engine/parserEngine");

const ICONS = {
    file:     "FILE",
    function: "FN",
    call:     "CALL",
    api:      "API",
    route:    "ROUTE",
    event:    "EVENT",
};

function printTree(node, indent = "") {
    const icon = ICONS[node.type] ?? node.type;

    let label = "";

    if (node.type === "file") {
        label = node.file;
    } else if (node.type === "function") {
        label = `${node.name}  [${node.fnType}${node.isAsync ? " async" : ""}]  line ${node.line}`;
    } else if (node.type === "call") {
        label = `${node.callee}  line ${node.line}`;
    } else if (node.type === "api") {
        label = `${node.lib}.${node.method}  ${node.url ?? ""}  line ${node.line}`;
    } else if (node.type === "route") {
        label = `${node.method} ${node.path}  handler:${node.handler ?? "?"}  line ${node.line}`;
    } else if (node.type === "event") {
        label = `${node.event} on <${node.element}>  handler:${node.handler ?? "?"}  line ${node.line}`;
    }

    console.log(`${indent}[${icon}] ${label}`);

    if (node.children?.length) {
        for (const child of node.children) {
            printTree(child, indent + "  │  ");
        }
    }
}

function runOnRepo(repoPath) {
    const files  = fileWalker(repoPath);
    let passed = 0;
    let failed = 0;

    const summary = {
        files: 0, functions: 0, calls: 0,
        apis: 0, routes: 0, events: 0,
    };

    console.log("\n========================================");
    console.log(` SHINKEI — ${repoPath}`);
    console.log(`  ${files.length} files found`);
    console.log("========================================\n");

    for (const filePath of files) {
        const result = runParser(filePath);

        if (!result) {
            console.log(`[FAILED] ${filePath}\n`);
            failed++;
            continue;
        }

        passed++;
        summary.files++;
        countSummary(result, summary);
        printTree(result);
        console.log();
    }

    console.log("========================================");
    console.log(" SUMMARY");
    console.log("========================================");
    console.log(`  Files      : ${passed} ok / ${failed} failed`);
    console.log(`  Functions  : ${summary.functions}`);
    console.log(`  Calls      : ${summary.calls}`);
    console.log(`  APIs       : ${summary.apis}`);
    console.log(`  Routes     : ${summary.routes}`);
    console.log(`  Events     : ${summary.events}`);
    console.log("========================================\n");
}

function countSummary(node, summary) {
    if (node.type === "function") summary.functions++;
    else if (node.type === "call")  summary.calls++;
    else if (node.type === "api")   summary.apis++;
    else if (node.type === "route") summary.routes++;
    else if (node.type === "event") summary.events++;

    if (node.children) {
        for (const child of node.children) countSummary(child, summary);
    }
}

module.exports = { runOnRepo };
