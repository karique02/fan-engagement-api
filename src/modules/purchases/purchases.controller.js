const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const { PURCHASE_STATUSES } = require("../../shared/validation/patterns");
const service = require("./purchases.service");

/*
 * Protegido.
 *
 * Checkout: convierte el carrito del usuario autenticado en una compra
 * (status = 'pending') y lo vacía, todo en una transacción.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const postPurchase = asyncHandler(async (req, res) => {
    const purchase = await service.checkout(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Compra registrada exitosamente",
        data: { purchase },
    });
});

const listPurchases = asyncHandler(async (req, res) => {
    const result = await service.listPurchases(req.query);

    return sendSuccess(res, req, {
        message: "Historial de compras recuperado exitosamente",
        data: result,
    });
});

/*
 * Protegido.
 *
 * Historial de compras del usuario autenticado, paginado, sin filtros,
 * incluyendo los ítems de cada compra. Consumo: Android.
 */
const listMyPurchases = asyncHandler(async (req, res) => {
    const result = await service.listMyPurchases({
        userId: req.authenticatedUser.sub,
        query: req.query,
    });

    return sendSuccess(res, req, {
        message: "Historial de compras recuperado exitosamente",
        data: result,
    });
});

/*
 * Protegido.
 *
 * Detalle de una compra con sus ítems.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const getPurchaseDetail = asyncHandler(async (req, res) => {
    const purchaseId = Number(req.params.purchaseId);

    if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El purchaseId debe ser un entero positivo",
        });
    }

    const purchase = await service.getPurchaseDetail(purchaseId);

    return sendSuccess(res, req, {
        message: "Compra recuperada exitosamente",
        data: { purchase },
    });
});

/*
 * Protegido.
 *
 * Cambia el estado de una compra (a cargo del admin desde la web).
 *
 * Body:
 * { "status": "completed" | "cancelled" | "pending" }
 */
const updateStatus = asyncHandler(async (req, res) => {
    const purchaseId = Number(req.params.purchaseId);

    if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El purchaseId debe ser un entero positivo",
        });
    }

    const { status } = req.body ?? {};

    if (!PURCHASE_STATUSES.includes(status)) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El campo 'status' debe ser uno de: pending, completed, cancelled",
        });
    }

    const purchase = await service.updateStatus({ purchaseId, status });

    return sendSuccess(res, req, {
        message: "Estado de la compra actualizado exitosamente",
        data: { purchase },
    });
});

module.exports = {
    postPurchase,
    listPurchases,
    listMyPurchases,
    getPurchaseDetail,
    updateStatus,
};
