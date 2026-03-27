const express = require("express");
const router = express.Router();
const { analyzeRepo } = require("../controllers/analyze.controller");

router.post("/", analyzeRepo);

module.exports = router;
