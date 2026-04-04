const express = require("express");
const router = express.Router();
const { analyzeRepo } = require("../controllers/analyze.controller");
//const { getFunctionCode } = require("../controllers/code.controller");

const { stopActiveProcesses, clearTempFolder } = require("../utils/githubZipHandler");
const dynamicStore = require("../services/dynamicStore");
const telemetryRoutes = require("./telemetry.routes");
const { index } = require("../services/indexBuilder");

router.post("/", analyzeRepo);

router.post("/stop", async (req, res) => {
    try {
        await stopActiveProcesses();
        await clearTempFolder();
        dynamicStore.reset();
        telemetryRoutes.resetRealtimeState();
        index._reset(); // 👈 Explicitly clear static index
        res.json({ success: true, message: "Analysis stopped and environment cleared." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

//router.get("/code", getFunctionCode);


module.exports = router;
