const express = require("express");

const app = express();

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

app.use(express.json());

/**
 * Estructura estándar para respuestas JSON exitosas.
 */
function sendSuccess(res, req, {
    statusCode = 200,
    message = "Request completed successfully",
    data = null,
} = {}) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "success",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}

/**
 * Estructura estándar para respuestas JSON con error.
 */
function sendError(res, req, {
    statusCode = 500,
    message = "An unexpected error occurred",
    data = null,
} = {}) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "error",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}

/**
 * Endpoint público de validación inicial.
 *
 * Se devuelve texto plano porque ese fue el requisito para probar
 * rápidamente el despliegue en Railway.
 */
app.get("/", (req, res) => {
    return res
        .status(200)
        .type("text/plain")
        .send("Hola mundo desde Fan Engagement API");
});

/**
 * Endpoint temporal para comprobar que el wrapper JSON funciona.
 * Este no es obligatorio para Railway, pero sirve como referencia
 * para los siguientes endpoints reales.
 */
app.get("/api/v1/health", (req, res) => {
    return sendSuccess(res, req, {
        message: "API is running correctly",
        data: {
            service: "fan-engagement-api",
        },
    });
});

/**
 * Manejo de rutas inexistentes.
 */
app.use((req, res) => {
    return sendError(res, req, {
        statusCode: 404,
        message: "Route not found",
        data: {
            path: req.originalUrl,
        },
    });
});

/**
 * Manejo centralizado de errores no controlados.
 */
app.use((error, req, res, next) => {
    console.error(error);

    return sendError(res, req, {
        statusCode: 500,
        message: "Internal server error",
    });
});

app.listen(port, host, () => {
    console.log(`Server running on http://localhost:${port}`);
});