const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { sendError } = require("../http/response");

function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return sendError(res, req, {
            statusCode: 401,
            message: "Se requiere token de autenticación",
        });
    }

    const token = authorization.substring("Bearer ".length);

    try {
        req.authenticatedUser = jwt.verify(token, env.jwtSecret);
        next();
    } catch {
        return sendError(res, req, {
            statusCode: 401,
            message: "Token de autenticación inválido o expirado",
        });
    }
}

module.exports = authenticateToken;
