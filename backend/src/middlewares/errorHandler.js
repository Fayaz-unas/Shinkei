/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${err.message}`);
    if (err.stack) {
        console.error(err.stack);
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        // Only include stack in development if needed
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

module.exports = errorHandler;
