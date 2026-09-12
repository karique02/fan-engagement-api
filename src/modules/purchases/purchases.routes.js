const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./purchases.controller");

const router = Router();

router.post("/api/v1/purchases", authenticateToken, controller.postPurchase);
router.get("/api/v1/purchases", authenticateToken, controller.listPurchases);
/*
 * IMPORTANTE: /purchases/me debe registrarse antes que /purchases/:purchaseId
 * — si no, Express matchea "me" como :purchaseId y rompe este endpoint.
 */
router.get(
    "/api/v1/purchases/me",
    authenticateToken,
    controller.listMyPurchases,
);
router.get(
    "/api/v1/purchases/:purchaseId",
    authenticateToken,
    controller.getPurchaseDetail,
);
router.patch(
    "/api/v1/purchases/:purchaseId/status",
    authenticateToken,
    controller.updateStatus,
);

module.exports = router;
