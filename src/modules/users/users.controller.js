const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./users.service");

/*
 * Protegido.
 *
 * Registra o reemplaza el Firebase Cloud Messaging token
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "fcmToken": "firebase-registration-token"
 * }
 */
const putFcmToken = asyncHandler(async (req, res) => {
    const { fcmToken } = req.body ?? {};

    if (typeof fcmToken !== "string" || fcmToken.trim().length === 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El token de Firebase es obligatorio.",
        });
    }

    const user = await service.updateFcmToken(
        req.authenticatedUser.sub,
        fcmToken.trim(),
    );

    if (!user) {
        return sendError(res, req, {
            statusCode: 404,
            message: "El usuario autenticado no fue encontrado",
        });
    }

    return sendSuccess(res, req, {
        message: "Token de Firebase actualizado exitosamente",
        data: { user },
    });
});

/*
 * Protegido.
 *
 * Elimina el Firebase Cloud Messaging token
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const deleteFcmToken = asyncHandler(async (req, res) => {
    const user = await service.clearFcmToken(req.authenticatedUser.sub);

    if (!user) {
        return sendError(res, req, {
            statusCode: 404,
            message: "El usuario autenticado no fue encontrado",
        });
    }

    return sendSuccess(res, req, {
        message: "Token de Firebase eliminado exitosamente",
        data: { user },
    });
});

const listUsers = asyncHandler(async (req, res) => {
    const users = await service.listUsers();

    return sendSuccess(res, req, {
        message: "Usuarios recuperados exitosamente",
        data: { users },
    });
});

module.exports = { putFcmToken, deleteFcmToken, listUsers };
