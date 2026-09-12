const pool = require("../../config/database");
const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");

/*
 * Público.
 * Debe devolver texto plano, no JSON.
 */
const getRoot = (req, res) => {
    return res
        .status(200)
        .type("text/plain")
        .send("Hola mundo desde Fan Engagement API");
};

/*
 * Público.
 * Útil para saber que API y base de datos están operativas.
 */
const getHealth = asyncHandler(async (req, res) => {
    await pool.query("SELECT 1");

    return sendSuccess(res, req, {
        message: "API y base de datos están funcionando correctamente",
        data: {
            service: "fan-engagement-api",
        },
    });
});

module.exports = { getRoot, getHealth };
