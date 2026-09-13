const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./dashboard.service");

const getEngagement = asyncHandler(async (req, res) => {
    const data = await service.getEngagement();

    return sendSuccess(res, req, {
        message: "Métricas de fan engagement recuperadas exitosamente",
        data,
    });
});

const getUserEngagement = asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El userId debe ser un entero positivo",
        });
    }

    const data = await service.getUserEngagement(userId);

    return sendSuccess(res, req, {
        message: "Métricas de fan engagement del fan recuperadas exitosamente",
        data,
    });
});

module.exports = { getEngagement, getUserEngagement };
