const express = require("express");
const router = express.Router();
const { analyzeRepo } = require("../controllers/analyze.controller");
//const { getFunctionCode } = require("../controllers/code.controller");

router.post("/", analyzeRepo);

//router.get("/code", getFunctionCode);


module.exports = router;
