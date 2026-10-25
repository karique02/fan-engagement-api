const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./interactions.controller");

const router = Router();

router.post(
    "/api/v1/products/interaction",
    authenticateToken,
    requireFan,
    controller.postProductInteraction,
);
router.post(
    "/api/v1/promotions/interaction",
    authenticateToken,
    requireFan,
    controller.postPromotionInteraction,
);
router.get(
    "/api/v1/products/interaction/all",
    authenticateToken,
    requireAdmin,
    controller.listProductInteractionsAll,
);
router.get(
    "/api/v1/promotions/interaction/all",
    authenticateToken,
    requireAdmin,
    controller.listPromotionInteractionsAll,
);

module.exports = router;
