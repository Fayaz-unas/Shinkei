const dynamicStore = require('../services/dynamicStore');
const sseService = require('../services/sseService');
const { analyzeFunction } = require('../services/queryEngine');

// ─── 📡 ROUTES ────────────────────────────────────────────────────────

const enableRealtimeWaiting = (options = {}) => {
    waitingForRealtimeRoot = true;
    realtimeAnalysisOptions = {
        direction: options.direction || 'forward',
        depth: parseInt(options.depth) || 8
    };
    console.log(`📡 Real-time mode: Waiting for next interaction (Direction: ${realtimeAnalysisOptions.direction}, Depth: ${realtimeAnalysisOptions.depth})...`);
};

const resetRealtimeState = () => {
    waitingForRealtimeRoot = false;
    lastIgnoredTraceId = null;
    console.log("🧹 [Telemetry] Real-time state reset.");
};

const reset = (req, res) => {
    console.log("♻️ [Telemetry] Manual reset requested. Clearing filters.");
    lastIgnoredTraceId = null; // 👈 Clear on manual reset
    enableRealtimeWaiting(req.body);
    res.json({ success: true, message: "Ready for next interaction." });
};

const stream = (req, res) => {
    sseService.addClient(req, res);
};

const ingestTraces = (req, res) => {
    try {
        const resourceSpans = req.body.resourceSpans || [];
        let spanCount = 0;
        const validSpansForPulse = []; 
        let rootCandidate = null;

        resourceSpans.forEach(resource => {
            resource.scopeSpans.forEach(scope => {
                scope.spans.forEach(span => {
                    spanCount++;
                    
                    const flatSpan = {
                        traceId: span.traceId,
                        spanId: span.spanId,
                        parentSpanId: span.parentSpanId,
                        name: span.name,
                        startTime: span.startTimeUnixNano,
                        endTime: span.endTimeUnixNano,
                        attributes: span.attributes.reduce((acc, attr) => {
                            acc[attr.key] = attr.value.stringValue ?? attr.value.intValue ?? attr.value.boolValue;
                            return acc;
                        }, {})
                    };

                    dynamicStore.addSpan(flatSpan);

                    const file = flatSpan.attributes['shinkei.static.file'];
                    const line = flatSpan.attributes['shinkei.static.line'];
                    const staticFnName = flatSpan.attributes['shinkei.static.function'];
                    const name = flatSpan.name || "";
                    const method = flatSpan.attributes['http.method'] || flatSpan.attributes['http.url'];
                    const route = flatSpan.attributes['http.route'] || flatSpan.attributes['http.target'];
                    const traceId = flatSpan.traceId;

                    // ── VERBOSE LOGGING FOR ROOT DETECTION ──
                    if (waitingForRealtimeRoot && !rootCandidate) {
                         const isNoise = ['middleware', 'expressInit', 'query', 'cors', 'bodyParser', '<anonymous>']
                            .some(str => name.toLowerCase().includes(str.toLowerCase()));

                         if (traceId === lastIgnoredTraceId) {
                             // console.log(`   ⏭️  Ignoring span from trace ${traceId} (already handled)`);
                         } else if (isNoise) {
                             console.log(`   💤 Skipping noise span: "${name}"`);
                         } else if (file && line) {
                             const rootName = staticFnName || name;
                             console.log(`   🎯 [MATCH] Found static function: ${rootName} at ${file}:${line}`);
                             rootCandidate = { name: rootName, file, line, traceId };
                         } else if (method && route && route !== '/*') {
                             console.log(`   🎯 [MATCH] Found HTTP route: ${method} ${route}`);
                             rootCandidate = { name: `${method} ${route}`, isRoute: true, traceId };
                         } else {
                             // console.log(`   ❓ Span "${name}" lacks static metadata or route info.`);
                         }
                    }

                    // Pulse data for valid spans (always processed if static info is present)
                    if (file && line) {
                        validSpansForPulse.push({
                            nodeId: `${file}:${line}`,
                            name: staticFnName || name,
                            rawStartTime: BigInt(flatSpan.startTime),
                            durationMs: Number(BigInt(flatSpan.endTime) - BigInt(flatSpan.startTime)) / 1_000_000,
                            method,
                            route
                        });
                    }
                });
            });
        });

        // 🟢 REAL-TIME GRAPH GENERATION
        if (waitingForRealtimeRoot && rootCandidate) {
            console.log(`🚀 [Telemetry] Activating analysis for root: ${rootCandidate.name}`);
            waitingForRealtimeRoot = false; 
            lastIgnoredTraceId = rootCandidate.traceId; 

            // Use setImmediate to avoid blocking the ingestion response
            setImmediate(() => {
                try {
                    const result = analyzeFunction(
                        rootCandidate.name, 
                        realtimeAnalysisOptions.direction, 
                        realtimeAnalysisOptions.depth,
                        rootCandidate.file
                    );

                    if (result && !result.error) {
                        console.log(`📊 [Telemetry] Analysis successful. Broadcasting graph...`);
                        const idMap = new Map();
                        let counter = 0;
                        const getNumericId = (id) => {
                            if (!idMap.has(id)) idMap.set(id, counter++);
                            return idMap.get(id);
                        };

                        const numericFlow = {
                            root: "0",
                            nodes: result.fullGraph.nodes.map(n => ({
                                ...n,
                                originalId: n.id,
                                nodeId: n.nodeId,
                                id: String(getNumericId(n.id))
                            })),
                            edges: result.fullGraph.edges.map(e => ({
                                from: String(getNumericId(e.from)),
                                to:   String(getNumericId(e.to))
                            }))
                        };

                        sseService.broadcastGraph({
                            flow: numericFlow,
                            trace: result.flow,
                            stats: result.stats,
                            telemetry: result.telemetry,
                            meta: result.meta
                        });
                    } else {
                        console.error(`❌ [Telemetry] Analysis failed for ${rootCandidate.name}:`, result?.error || "Unknown error");
                        // ⛔ Removed auto-re-arm: waitingForRealtimeRoot = true; 
                        console.log("⏸️ [Telemetry] Analysis failed. Press 'Analyze Next Click' to try again.");
                    }
                } catch (analysisErr) {
                    console.error(`💥 [Telemetry] Analysis crashed for ${rootCandidate.name}:`, analysisErr.message);
                    // ⛔ Removed auto-re-arm: waitingForRealtimeRoot = true; 
                    console.log("⏸️ [Telemetry] Analysis crashed. Press 'Analyze Next Click' to try again.");
                }
            });
        }

        // WATERFALL SORTING FOR PULSES
        if (validSpansForPulse.length > 0) {
            const traceStartTime = validSpansForPulse.reduce(
                (min, p) => (p.rawStartTime < min ? p.rawStartTime : min), 
                validSpansForPulse[0].rawStartTime
            );

            const waterfallData = validSpansForPulse.map(p => ({
                nodeId: p.nodeId,
                name: p.name,
                durationMs: Number(p.durationMs.toFixed(2)),
                offsetMs: Number(p.rawStartTime - traceStartTime) / 1_000_000,
                method: p.method,
                route: p.route
            })).sort((a, b) => a.offsetMs - b.offsetMs);

            sseService.broadcastPulse(waterfallData);
        }

        res.status(200).send('Traces ingested');
    } catch (err) {
        console.error('❌ [Telemetry] Error:', err.message);
        res.status(500).send('Ingestion error');
    }
};

module.exports = {
    reset,
    stream,
    ingestTraces,
    enableRealtimeWaiting,
    resetRealtimeState
};
