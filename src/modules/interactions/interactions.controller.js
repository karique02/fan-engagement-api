const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const { parseInteractionListQuery } = require("../../shared/validation/listQuery");
const service = require("./interactions.service");

/*
 * Protegido.
 *
 * Registra una interacción del usuario autenticado con un producto.
 *
 * Si es la primera interacción del usuario con ese producto:
 * - crea el registro con interaction_count = 1.
 * - rating = rating recibido.
 *
 * Si el registro ya existe:
 * - recalcula el promedio de rating.
 * - incrementa interaction_count.
 * - actualiza last_interaction_at.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "productId": 12,
 *   "rating": 5
 * }
 */
const postProductInteraction = asyncHandler(async (req, res) => {
    const { productId, rating } = req.body ?? {};

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El productId debe ser un entero positivo",
        });
    }

    if (
        typeof rating !== "number" ||
        !Number.isFinite(rating) ||
        rating < 1 ||
        rating > 5
    ) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El rating debe ser un número entre 1 y 5",
        });
    }

    const interaction = await service.createProductInteraction({
        userId: req.authenticatedUser.sub,
        productId,
        rating,
    });

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Interacción con el producto registrada exitosamente",
        data: { interaction },
    });
});

/*
 * Protegido.
 *
 * Registra una interacción del usuario autenticado con una promoción.
 *
 * Si es la primera interacción:
 * - crea el registro con interaction_count = 1.
 * - rating = rating recibido.
 *
 * Si ya existe la combinación user_id + promotion_id:
 * - recalcula el promedio de rating.
 * - incrementa interaction_count.
 * - actualiza last_interaction_at.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "promotionId": 12,
 *   "rating": 5
 * }
 */
const postPromotionInteraction = asyncHandler(async (req, res) => {
    const { promotionId, rating } = req.body ?? {};

    if (!Number.isSafeInteger(promotionId) || promotionId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El promotionId debe ser un entero positivo",
        });
    }

    if (
        typeof rating !== "number" ||
        !Number.isFinite(rating) ||
        rating < 1 ||
        rating > 5
    ) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El rating debe ser un número entre 1 y 5",
        });
    }

    const interaction = await service.createPromotionInteraction({
        userId: req.authenticatedUser.sub,
        promotionId,
        rating,
    });

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Interacción con la promoción registrada exitosamente",
        data: { interaction },
    });
});

/*
 * Público.
 *
 * Recupera las interacciones entre usuarios y productos, paginadas y con
 * filtros opcionales por usuario, producto y rango de fechas
 * (últimaInteracción).
 *
 * Devuelve los datos de user_product_interaction,
 * junto con el username del usuario y el nombre del producto.
 *
 * No requiere autenticación.
 */
const listProductInteractionsAll = asyncHandler(async (req, res) => {
    const filters = parseInteractionListQuery(req, res, {
        entityParam: "productName",
    });
    if (!filters) {
        return;
    }

    const { items, pagination } = await service.listProductInteractionsAll(
        filters,
    );

    return sendSuccess(res, req, {
        message: "Interacciones con productos recuperadas exitosamente",
        data: { interactions: items, pagination },
    });
});

/*
 * Público.
 *
 * Recupera las interacciones entre usuarios y promociones, paginadas y con
 * filtros opcionales por usuario, promoción y rango de fechas
 * (últimaInteracción).
 *
 * Devuelve los datos de user_promotion_interaction,
 * junto con el username del usuario y el título de la promoción.
 *
 * No requiere autenticación.
 */
const listPromotionInteractionsAll = asyncHandler(async (req, res) => {
    const filters = parseInteractionListQuery(req, res, {
        entityParam: "promotionTitle",
    });
    if (!filters) {
        return;
    }

    const { items, pagination } = await service.listPromotionInteractionsAll(
        filters,
    );

    return sendSuccess(res, req, {
        message: "Interacciones con promociones recuperadas exitosamente",
        data: { interactions: items, pagination },
    });
});

module.exports = {
    postProductInteraction,
    postPromotionInteraction,
    listProductInteractionsAll,
    listPromotionInteractionsAll,
};
