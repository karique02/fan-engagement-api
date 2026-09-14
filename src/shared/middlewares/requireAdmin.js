const { sendError } = require("../http/response");

function requireAdmin(req, res, next) {
    if (req.authenticatedUser?.userType !== 2) {
        return sendError(res, req, {
            statusCode: 403,
            message: "Se requiere una cuenta de administrador",
        });
    }

    next();
}

module.exports = requireAdmin;
