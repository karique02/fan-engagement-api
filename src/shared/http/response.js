function sendSuccess(
    res,
    req,
    {
        statusCode = 200,
        message = "Solicitud completada correctamente.",
        data = null,
    } = {},
) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "success",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}
function sendError(
    res,
    req,
    {
        statusCode = 500,
        message = "Ocurrió un error inesperado.",
        data = null,
    } = {},
) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "error",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}

module.exports = { sendSuccess, sendError };
