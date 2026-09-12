const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./dashboard.service");

const getEngagement = asyncHandler(async (req, res) => {
    const data = await service.getEngagement();

    return sendSuccess(res, req, {
        message: "Métricas de fan engagement recuperadas exitosamente",
        data,
    });
});

module.exports = { getEngagement };
