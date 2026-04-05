const https = require("https");

/**
 * explain_service.js
 * LLM LAYER — sends function code to Gemini 2.5 Flash, returns structured explanation.
 *
 *  ✅ Prompt builder
 *  ✅ Gemini 2.5 Flash API call
 *  ✅ Response parser → structured JSON
 *  ✅ In-memory cache (label::codeHash → explanation)
 *  ✅ Failure safe — never throws, returns fallback on error
 *
 *  ❌ No graph logic   ❌ No index access   ❌ No traversal
 */

// ─── Config ───────────────────────────────────────────────────────────────────
function _getUrl() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) console.warn("[explain_service] GEMINI_API_KEY is not set");
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = new Map();

function _cacheKey(label, code) {
    return `${label}::${code.slice(0, 200)}`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function _ExplainPrompt(label, code) {
    return `You are a JavaScript code assistant.

Explain the following function in a simple, practical, and code-focused way.

Respond ONLY with a valid JSON object in this exact format:

{
  "explanation": "A very short 1-line description of what the function does",
  "steps": [
    "Short action describing what happens",
    "Short action describing next step"
  ]
}

Rules:
- Use ONLY the given code, do NOT assume anything outside it
- Keep explanation to must short like a summary in 2-3 line but should be clear and informative
- Steps must describe actual execution (state updates, API calls, conditions, loops)
- Steps must be short bullet-style phrases (5–10 words each)
- Do NOT prefix steps with "Step 1", "Step 2", etc.
- Keep steps between 4–9 items maximum
- Do NOT use generic words like "system", "platform", "dashboard"
- Focus on what the code actually does, not interpretation
- Keep everything concise and easy to scan
- Return raw JSON only (no markdown, no extra text)
- Do NOT describe UI rendering or visual elements
- if the code is incomplete or references external functions, explain only what is present in the snippet
- Do NOT attempt to fill in gaps with assumptions
- step and explanation should be such manner that no dev can understand the code without looking at it.
-if code contain branch steps with conditions, include the condition in the step description (e.g. "If user is admin, show admin panel")
Function:${label}
Code:${code}`
;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────
function _callGemini(prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        });

        const url     = _getUrl();
        const urlObj  = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   "POST",
            headers:  {
                "Content-Type":   "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let raw = "";
            res.on("data", chunk => raw += chunk);
            res.on("end", () => {
                console.log("[explain_service] status:", res.statusCode);
                try {
                    const parsed = JSON.parse(raw);

                    // Gemini error response
                    if (parsed.error) {
                        console.error("[explain_service] Gemini error:", parsed.error.message);
                        return resolve(null);
                    }

                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
                    if (!text) {
                        console.error("[explain_service] no text in candidates");
                        console.error("[explain_service] full response:", JSON.stringify(parsed).slice(0, 500));
                    } else {
                        console.log("[explain_service] extracted text (first 150 chars):", text.slice(0, 150));
                    }
                    resolve(text);
                } catch (e) {
                    console.error("[explain_service] JSON parse failed, raw:", raw.slice(0, 300));
                    reject(new Error("Failed to parse Gemini response"));
                }
            });
        });

        req.on("error", (err) => {
            console.error("[explain_service] request error:", err.message);
            reject(err);
        });

        req.write(body);
        req.end();
    });
}

// ─── Response parser ──────────────────────────────────────────────────────────
function _parseResponse(text) {
    if (!text) {
        console.error("[_parseResponse] text is null or empty");
        return null;
    }
    try {
        const clean = text.replace(/```json|```/g, "").trim();
        console.log("[_parseResponse] cleaned text (first 200 chars):", clean.slice(0, 200));
        return JSON.parse(clean);
    } catch (err) {
        console.error("[_parseResponse] JSON parse failed:", err.message);
        console.error("[_parseResponse] raw text (first 300 chars):", text.slice(0, 300));
        return null;
    }
}
function _AskPrompt(label, code, question) {
    return `You are a JavaScript code assistant.

Answer the question based on the following function code.

Rules:
- Answer concisely and directly (1-3 sentences max)
- Focus only on what the code does, not external assumptions
- If the question cannot be answered from the code, say so clearly
- Keep it code-focused and practical

Function: ${label}
Code: ${code}
Question: ${question}`;
}

// ─── Fallback ─────────────────────────────────────────────────────────────────
const FALLBACK = {
    explanation: "Explanation unavailable",
    steps:   [],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Explain a function using Gemini 2.5 Flash.
 *
 * @param   {string} label - Function name (e.g. "OrderController.getProducts")
 * @param   {string} code  - Raw source code of the function
 * @returns {Promise<{ summary, details, steps }>}
 */
async function explainFunction(label, code) {
    if (!label || !code) return FALLBACK;

    const key = _cacheKey(label, code);
    if (cache.has(key)) {
        console.log("[explain_service] cache hit for:", label);
        return cache.get(key);
    }

    console.log("[explain_service] calling Gemini 2.5 Flash for:", label);
    console.log("[explain_service] key present:", !!process.env.GEMINI_API_KEY);

    try {
        const prompt  = _ExplainPrompt(label, code);
        const text    = await _callGemini(prompt);
        const parsed  = _parseResponse(text);
        const result  = parsed ?? FALLBACK;

        cache.set(key, result);
        return result;
    } catch (err) {
        console.error("[explain_service] failed:", err.message);
        return FALLBACK;
    }
}
async function askGemini(label, code, question) {
    if (!label) console.warn("[ask_gemini] label is missing");
    if (!code) console.warn("[ask_gemini] code is missing");
    if (!question) console.warn("[ask_gemini] question is missing");
    if (!label || !code || !question) return { answer: "Missing required parameters" };

    // Use a different cache key that includes the question to avoid collision with explainFunction
    const key = `ask::${label}::${code.slice(0, 200)}::${question.slice(0, 100)}`;
    if (cache.has(key)) {
        console.log("[ask_gemini] cache hit for:", label);
        return cache.get(key);
    }

    console.log("[ask_gemini] calling Gemini 2.5 Flash for:", label);
    console.log("[ask_gemini] key present:", !!process.env.GEMINI_API_KEY);

    try {
        const prompt  = _AskPrompt(label, code, question);
        const text    = await _callGemini(prompt);

        // Return plain text directly, wrapped in answer field
        const result = { answer: text || "Could not generate an answer" };

        cache.set(key, result);
        return result;
    } catch (err) {
        console.error("[ask_gemini] failed:", err.message);
        return { answer: "Failed to get answer: " + err.message };
    }
}

module.exports = { explainFunction, askGemini };