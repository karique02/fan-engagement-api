const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./purchases.controller");

const router = Router();

router.post(
    "/api/v1/purchases",
    authenticateToken,
    requireFan,
    controller.postPurchase,
);
router.get(
    "/api/v1/purchases",
    authenticateToken,
    requireAdmin,
    controller.listPurchases,
);
/*
 * IMPORTANTE: /purchases/me debe registrarse antes que /purchases/:purchaseId
 * — si no, Express matchea "me" como :purchaseId y rompe este endpoint.
 */
router.get(
    "/api/v1/purchases/me",
    authenticateToken,
    requireFan,
    controller.listMyPurchases,
);
router.get(
    "/api/v1/purchases/:purchaseId",
    authenticateToken,
    requireAdmin,
    controller.getPurchaseDetail,
);
router.patch(
    "/api/v1/purchases/:purchaseId/status",
    authenticateToken,
    requireAdmin,
    controller.updateStatus,
);

module.exports = router;
