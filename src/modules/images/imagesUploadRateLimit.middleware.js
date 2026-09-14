const { sendError } = require("../../shared/http/response");

const LIMIT_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;

const uploadTimestampsByUserId = new Map();

/*
 * Rate limit en memoria de proceso, por usuario admin, ventana móvil de 1h.
 * Solo la subida (POST) está limitada: la lectura pega directo contra el
 * bucket y no cuesta nada (ver spec 20).
 */
function imagesUploadRateLimit(req, res, next) {
    const userId = req.authenticatedUser.sub;
    const now = Date.now();
    const timestamps = (uploadTimestampsByUserId.get(userId) ?? []).filter(
        (timestamp) => now - timestamp < WINDOW_MS,
    );

    if (timestamps.length >= LIMIT_PER_HOUR) {
        return sendError(res, req, {
            statusCode: 429,
            message:
                "Alcanzaste el límite de 20 imágenes subidas por hora. Intenta de nuevo más tarde.",
        });
    }

    timestamps.push(now);
    uploadTimestampsByUserId.set(userId, timestamps);

    next();
}

module.exports = imagesUploadRateLimit;
