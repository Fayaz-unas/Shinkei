const express = require("express");
const router = express.Router();
const analyzeController = require("../controllers/analyzeController");

router.post("/", analyzeController.analyzeRepo);
router.post("/stop", analyzeController.stopAnalysis);

module.exports = router;
