const express = require("express");
const cors = require("./config/cors");

const analyzeRoutes = require("./routes/analyze.routes");

const app = express();

app.use(cors);
app.use(express.json());

// 👉 API route
app.use("/api/analyze", analyzeRoutes);

module.exports = app;
