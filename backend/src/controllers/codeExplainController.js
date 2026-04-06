const { explainFunction,askGemini } = require("../services/codeExplainService");

/**
 * explain_controller.js
 * HTTP LAYER — handles POST /api/explain-function
 *
 * Request body:
 *   { code: string, label: string }
 *
 * Response:
 *   { success: true, explanation: { summary, details, steps } }
 *
 *  ❌ No graph logic   ❌ No index access   ❌ No traversal
 */

exports.explainFunction = async (req, res) => {
    try {
        const { code, label } = req.body;

        if (!code || typeof code !== "string" || code.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error:   "code is required and must be a non-empty string.",
            });
        }

        if (!label || typeof label !== "string") {
            return res.status(400).json({
                success: false,
                error:   "label is required.",
            });
        }

        const explanation = await explainFunction(label.trim(), code.trim());

        return res.json({
            success:     true,
            label,
            explanation,
        });

    } catch (err) {
        console.error("[explain] crash:", err.message);
        return res.status(500).json({
            success: false,
            error:   "Failed to explain function: " + err.message,
        });
    }
};

exports.askGemini = async (req, res) => {
    try {
        const { code, label, question } = req.body;
        if (!code || typeof code !== "string" || code.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error:   "code is required and must be a non-empty string.",
            });
        }
        if (!label || typeof label !== "string") {
            return res.status(400).json({
                success: false,
                error:   "label is required.",
            });
        }
        if (!question || typeof question !== "string") {
            return res.status(400).json({
                success: false,
                error:   "question is required.",
            });
        }

        const answer = await askGemini(label.trim(), code.trim(), question.trim());

        return res.json({
            success:     true,
            label,
            question,
            answer,
        });

    } catch (err) {
        console.error("[askGemini] crash:", err.message);
        return res.status(500).json({
            success: false,
            error:   "Failed to ask Gemini: " + err.message,
        });
    }
};
