const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./catalog.service");

const listProducts = asyncHandler(async (req, res) => {
    const products = await service.listProducts();

    return sendSuccess(res, req, {
        message: "Productos recuperados exitosamente",
        data: { products },
    });
});

const listPromotions = asyncHandler(async (req, res) => {
    const promotions = await service.listPromotions();

    return sendSuccess(res, req, {
        message: "Promociones recuperadas exitosamente",
        data: { promotions },
    });
});

module.exports = { listProducts, listPromotions };
