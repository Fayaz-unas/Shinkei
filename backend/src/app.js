const express = require("express");
const cors = require("./config/cors");
const errorHandler = require("./middlewares/errorHandler");

const analyzeRoutes = require("./routes/analyzeRoutes");
const codeExplainRoutes = require("./routes/codeExplainRoutes");
const telemetryRoutes = require("./routes/telemetryRoutes");

const app = express();

app.use(cors);

// Increase limit for trace payloads (OTel batches can be large)
app.use(express.json({ limit: '5mb' })); 

// 👉 API routes
app.use("/api/analyze", analyzeRoutes);
app.use("/api", codeExplainRoutes);

// 👉 Shinkei Telemetry Ingest
app.use("/api/shinkei", telemetryRoutes);

// 👉 Global Error Handler
app.use(errorHandler);

module.exports = app;
