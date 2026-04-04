 // shinkei/backend/src/engines/dynamicStore.js


class DynamicStore {

    constructor() {

        this.traces = new Map(); // traceId -> [spans]

        this.routeMetrics = new Map(); // "GET:/api/users" -> { avgTime, hitCount, lastTraceId }

        this.MAX_TRACES = 1000; // Prevent memory leaks

    }


    addSpan(span) {

        const { traceId, startTime, endTime, attributes: attrs = {} } = span;


        // 1. Manage Trace Storage

        if (!this.traces.has(traceId)) {

            // Basic eviction: if we exceed limit, delete the oldest trace (first key in Map)

            if (this.traces.size >= this.MAX_TRACES) {

                const firstKey = this.traces.keys().next().value;

                this.traces.delete(firstKey);

            }

            this.traces.set(traceId, []);

        }

        this.traces.get(traceId).push(span);


        // 2. Metrics Calculation

        const method = attrs['http.method'];

        const route = attrs['http.route'] || attrs['http.target']; 


        if (method && route) {

            const routeKey = `${method.toUpperCase()}:${route}`;

            

            // Calculate duration in MS using BigInt for precision

            // (Nanoseconds / 1,000,000 = Milliseconds)

            const durationMs = Number(BigInt(endTime) - BigInt(startTime)) / 1_000_000;

            

            const existing = this.routeMetrics.get(routeKey) || { avgTime: 0, hitCount: 0 };

            const newCount = existing.hitCount + 1;

            const newAvg = ((existing.avgTime * existing.hitCount) + durationMs) / newCount;


            this.routeMetrics.set(routeKey, {

                avgTime: newAvg,

                hitCount: newCount,

                lastTraceId: traceId,

                lastDuration: durationMs

            });

        }

    }


    getAllTraces() {

        // Converts the Map into an array of summaries for the list view

        return Array.from(this.traces.entries()).map(([traceId, spans]) => {

            // Attempt to find the "root" span (the one without a parent) to get the best name

            const rootSpan = spans.find(s => !s.parentSpanId) || spans[0];

            

            return {

                traceId,

                name: rootSpan?.name || 'Unknown',

                timestamp: rootSpan?.startTime || Date.now(),

                spanCount: spans.length

            };

        });

    }


    getTraceById(traceId) {

        return this.traces.get(traceId) || [];

    }


    getMetricsForRoute(method, route) {

        if (!method || !route) return null;

        const routeKey = `${method.toUpperCase()}:${route}`;

        return this.routeMetrics.get(routeKey) || null;

    }


    getMetrics() {
        return Object.fromEntries(this.routeMetrics);
    }

    reset() {
        this.traces.clear();
        this.routeMetrics.clear();
        console.log("🧹 [DynamicStore] Reset complete.");
    }
}


module.exports = new DynamicStore();


