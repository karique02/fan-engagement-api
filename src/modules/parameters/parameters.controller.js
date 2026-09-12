const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./parameters.service");

const getPersonalizedNotifications = asyncHandler(async (req, res) => {
    const settings = await service.getPersonalizedNotificationSettings();

    return sendSuccess(res, req, {
        message: "Configuración obtenida exitosamente",
        data: { settings },
    });
});

const putPersonalizedNotifications = asyncHandler(async (req, res) => {
    const settings = await service.updatePersonalizedNotificationSettings(
        req.body ?? {},
    );

    return sendSuccess(res, req, {
        message: "Configuración actualizada exitosamente",
        data: { settings },
    });
});

module.exports = { getPersonalizedNotifications, putPersonalizedNotifications };
