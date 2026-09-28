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
    const promotions = await service.listPromotions(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        message: "Promociones recuperadas exitosamente",
        data: { promotions },
    });
});

const getProductById = asyncHandler(async (req, res) => {
    const product = await service.getProductById(req.params.id);

    return sendSuccess(res, req, {
        message: "Producto recuperado exitosamente",
        data: { product },
    });
});

const getPromotionById = asyncHandler(async (req, res) => {
    const promotion = await service.getPromotionById(req.params.id);

    return sendSuccess(res, req, {
        message: "Promoción recuperada exitosamente",
        data: { promotion },
    });
});

module.exports = { listProducts, listPromotions, getProductById, getPromotionById };
