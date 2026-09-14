const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./catalogAdmin.service");

// Categorías de producto

const listProductCategories = asyncHandler(async (req, res) => {
    const data = await service.listProductCategories();
    return sendSuccess(res, req, {
        message: "Categorías de producto recuperadas exitosamente",
        data,
    });
});

const createProductCategory = asyncHandler(async (req, res) => {
    const data = await service.createProductCategory(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Categoría de producto creada exitosamente",
        data,
    });
});

const updateProductCategory = asyncHandler(async (req, res) => {
    const data = await service.updateProductCategory(
        req.params.id,
        req.body ?? {},
    );
    return sendSuccess(res, req, {
        message: "Categoría de producto actualizada exitosamente",
        data,
    });
});

const deleteProductCategory = asyncHandler(async (req, res) => {
    await service.deleteProductCategory(req.params.id);
    return sendSuccess(res, req, {
        message: "Categoría de producto eliminada exitosamente",
    });
});

// Categorías de promoción

const listPromotionCategories = asyncHandler(async (req, res) => {
    const data = await service.listPromotionCategories();
    return sendSuccess(res, req, {
        message: "Categorías de promoción recuperadas exitosamente",
        data,
    });
});

const createPromotionCategory = asyncHandler(async (req, res) => {
    const data = await service.createPromotionCategory(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Categoría de promoción creada exitosamente",
        data,
    });
});

const updatePromotionCategory = asyncHandler(async (req, res) => {
    const data = await service.updatePromotionCategory(
        req.params.id,
        req.body ?? {},
    );
    return sendSuccess(res, req, {
        message: "Categoría de promoción actualizada exitosamente",
        data,
    });
});

const deletePromotionCategory = asyncHandler(async (req, res) => {
    await service.deletePromotionCategory(req.params.id);
    return sendSuccess(res, req, {
        message: "Categoría de promoción eliminada exitosamente",
    });
});

// Productos

const listProducts = asyncHandler(async (req, res) => {
    const data = await service.listProducts(req.query);
    return sendSuccess(res, req, {
        message: "Productos recuperados exitosamente",
        data,
    });
});

const createProduct = asyncHandler(async (req, res) => {
    const data = await service.createProduct(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Producto creado exitosamente",
        data,
    });
});

const updateProduct = asyncHandler(async (req, res) => {
    const data = await service.updateProduct(req.params.id, req.body ?? {});
    return sendSuccess(res, req, {
        message: "Producto actualizado exitosamente",
        data,
    });
});

const deactivateProduct = asyncHandler(async (req, res) => {
    const data = await service.deactivateProduct(req.params.id);
    return sendSuccess(res, req, {
        message: "Producto desactivado exitosamente",
        data,
    });
});

// Promociones

const listPromotions = asyncHandler(async (req, res) => {
    const data = await service.listPromotions(req.query);
    return sendSuccess(res, req, {
        message: "Promociones recuperadas exitosamente",
        data,
    });
});

const createPromotion = asyncHandler(async (req, res) => {
    const data = await service.createPromotion(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Promoción creada exitosamente",
        data,
    });
});

const updatePromotion = asyncHandler(async (req, res) => {
    const data = await service.updatePromotion(req.params.id, req.body ?? {});
    return sendSuccess(res, req, {
        message: "Promoción actualizada exitosamente",
        data,
    });
});

const deactivatePromotion = asyncHandler(async (req, res) => {
    const data = await service.deactivatePromotion(req.params.id);
    return sendSuccess(res, req, {
        message: "Promoción desactivada exitosamente",
        data,
    });
});

// Ventajas de ser miembro

const listMemberPromotions = asyncHandler(async (req, res) => {
    const data = await service.listMemberPromotions(req.query);
    return sendSuccess(res, req, {
        message: "Ventajas de ser miembro recuperadas exitosamente",
        data,
    });
});

const createMemberPromotion = asyncHandler(async (req, res) => {
    const data = await service.createMemberPromotion(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Ventaja de ser miembro creada exitosamente",
        data,
    });
});

const updateMemberPromotion = asyncHandler(async (req, res) => {
    const data = await service.updateMemberPromotion(
        req.params.id,
        req.body ?? {},
    );
    return sendSuccess(res, req, {
        message: "Ventaja de ser miembro actualizada exitosamente",
        data,
    });
});

const deactivateMemberPromotion = asyncHandler(async (req, res) => {
    const data = await service.deactivateMemberPromotion(req.params.id);
    return sendSuccess(res, req, {
        message: "Ventaja de ser miembro desactivada exitosamente",
        data,
    });
});

module.exports = {
    listProductCategories,
    createProductCategory,
    updateProductCategory,
    deleteProductCategory,
    listPromotionCategories,
    createPromotionCategory,
    updatePromotionCategory,
    deletePromotionCategory,
    listProducts,
    createProduct,
    updateProduct,
    deactivateProduct,
    listPromotions,
    createPromotion,
    updatePromotion,
    deactivatePromotion,
    listMemberPromotions,
    createMemberPromotion,
    updateMemberPromotion,
    deactivateMemberPromotion,
};
