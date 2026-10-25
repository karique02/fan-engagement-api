const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const pool = require("../../config/database");
const { sendError } = require("../http/response");
const { findUserSessionState } = require("../../modules/auth/auth.repository");

async function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return sendError(res, req, {
            statusCode: 401,
            message: "Se requiere token de autenticación",
            data: { reason: "session_expired" },
        });
    }

    const token = authorization.substring("Bearer ".length);
    let payload;

    try {
        payload = jwt.verify(token, env.jwtSecret);
    } catch {
        return sendError(res, req, {
            statusCode: 401,
            message: "Token de autenticación inválido o expirado",
            data: { reason: "session_expired" },
        });
    }

    // Re-chequeo contra DB en cada request (spec 34): el rol o estado pudo cambiar después del login.
    const user = await findUserSessionState(pool, payload.sub);

    if (!user || user.state !== "active") {
        return sendError(res, req, {
            statusCode: 401,
            message: "Tu cuenta ya no está disponible. Contacta a un administrador.",
            data: { reason: "account_unavailable" },
        });
    }

    if (Number(user.user_type) !== payload.userType) {
        return sendError(res, req, {
            statusCode: 401,
            message: "Tus permisos cambiaron. Inicia sesión nuevamente.",
            data: { reason: "role_changed" },
        });
    }

    req.authenticatedUser = payload;
    next();
}

module.exports = authenticateToken;
