const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./recommendations.service");

/*
 * Ejecuta manualmente el entrenamiento de filtrado colaborativo.
 */
const postTrain = asyncHandler(async (req, res) => {
    const result = await service.train();

    return sendSuccess(res, req, {
        message: result.skipped
            ? "El entrenamiento fue omitido porque ya hay uno en ejecución"
            : "Entrenamiento de recomendaciones ejecutado exitosamente",
        data: result,
    });
});

/*
 * Protegido.
 *
 * Devuelve las recomendaciones de productos del usuario autenticado.
 */
const getProductRecommendations = asyncHandler(async (req, res) => {
    const products = await service.listProductRecommendations(
        req.authenticatedUser.sub,
    );

    return sendSuccess(res, req, {
        message: "Recomendaciones de productos obtenidas exitosamente",
        data: { products },
    });
});

/*
 * Protegido.
 *
 * Devuelve las recomendaciones de promociones del usuario autenticado.
 */
const getPromotionRecommendations = asyncHandler(async (req, res) => {
    const promotions = await service.listPromotionRecommendations(
        req.authenticatedUser.sub,
    );

    return sendSuccess(res, req, {
        message: "Recomendaciones de promociones obtenidas exitosamente",
        data: { promotions },
    });
});

module.exports = { postTrain, getProductRecommendations, getPromotionRecommendations };
