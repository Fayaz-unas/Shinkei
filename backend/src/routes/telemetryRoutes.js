const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

// ─── 📡 RESET ENDPOINT ────────────────────────────────────────────────
router.post('/v1/reset', telemetryController.reset);

// ─── 📡 SSE ENDPOINT ──────────────────────────────────────────────────
router.get('/v1/stream', telemetryController.stream);

// ─── 📥 INGESTION & WATERFALL ENGINE ──────────────────────────────────
router.post('/v1/traces', telemetryController.ingestTraces);

module.exports = router;
// Exporting the state control methods for use in other parts of the app (like analyzeController)
module.exports.enableRealtimeWaiting = telemetryController.enableRealtimeWaiting;
module.exports.resetRealtimeState = telemetryController.resetRealtimeState;
