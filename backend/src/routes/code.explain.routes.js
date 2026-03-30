const express = require("express");
const router = express.Router();

const { explainFunction } = require("../controllers/code.explain.controller");

// This handles POST /api/explain-function
router.post("/explain-function", explainFunction);

module.exports = router;