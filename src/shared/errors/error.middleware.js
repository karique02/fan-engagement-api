const AppError = require("./AppError");
const { sendError } = require("../http/response");

/*
 * Errores inesperados.
 */
function errorMiddleware(error, req, res, next) {
    if (error instanceof AppError) {
        return sendError(res, req, {
            statusCode: error.statusCode,
            message: error.message,
            data: error.data,
        });
    }

    console.error(error);

    return sendError(res, req, {
        statusCode: 500,
        message: "Error interno del servidor",
    });
}

module.exports = errorMiddleware;
