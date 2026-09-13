const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./membership.service");

/*
 * Protegido.
 *
 * Estado de membresía del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const getMe = asyncHandler(async (req, res) => {
    const membership = await service.getMembershipStatus(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        message: "Estado de membresía recuperado exitosamente",
        data: { membership },
    });
});

/*
 * Protegido.
 *
 * Activa la prueba gratis de un mes para el usuario autenticado.
 *
 * Responde 409 con data.reason = 'trial_already_used' si el usuario
 * ya activó una prueba gratis anteriormente.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const postTrial = asyncHandler(async (req, res) => {
    const membership = await service.activateTrial(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Prueba gratis activada exitosamente",
        data: { membership },
    });
});

/*
 * Protegido.
 *
 * Lista las promociones exclusivas de socio.
 * Cada ítem incluye locked: true si el usuario autenticado
 * no tiene una membresía vigente.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const getPromotions = asyncHandler(async (req, res) => {
    const promotions = await service.listPromotions(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        message: "Promociones de socio recuperadas exitosamente",
        data: { promotions },
    });
});

module.exports = { getMe, postTrial, getPromotions };
