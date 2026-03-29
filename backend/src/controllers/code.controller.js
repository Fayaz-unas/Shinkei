// const codeService = require("../services/code.service");

// /**
//  * code.controller.js
//  *
//  * Handles GET /code?function=xyz
//  */
// exports.getFunctionCode = (req, res) => {
//     try {
//         const fnName = req.query.function;

//         if (!fnName) {
//             return res.status(400).json({
//                 success: false,
//                 error: "?function query parameter is required."
//             });
//         }

//         // Let the dedicated service handle the logic
//         const result = codeService.getFunctionCodeSnippet(fnName);

//         return res.json({
//             success: true,
//             ...result
//         });

//     } catch (err) {
//         console.error("[code.controller] Crash:", err.message);
        
//         // Smart error codes based on what failed in the service
//         const statusCode = err.message.includes("not found") ? 404 : 500;
        
//         return res.status(statusCode).json({
//             success: false,
//             error: err.message
//         });
//     }
// };