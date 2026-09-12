const { sendError } = require("../http/response");

/*
 * Ruta no encontrada.
 */
function notFoundMiddleware(req, res) {
    return sendError(res, req, {
        statusCode: 404,
        message: "Ruta no encontrada",
        data: {
            path: req.originalUrl,
        },
    });
}

module.exports = notFoundMiddleware;
