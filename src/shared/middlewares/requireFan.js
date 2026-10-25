const { sendError } = require("../http/response");

function requireFan(req, res, next) {
    if (req.authenticatedUser?.userType !== 1) {
        return sendError(res, req, {
            statusCode: 403,
            message: "Se requiere una cuenta de fan",
        });
    }

    next();
}

module.exports = requireFan;
