const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./interactions.controller");

const router = Router();

router.post(
    "/api/v1/products/interaction",
    authenticateToken,
    controller.postProductInteraction,
);
router.post(
    "/api/v1/promotions/interaction",
    authenticateToken,
    controller.postPromotionInteraction,
);
/*
 * Públicas — no llevan authenticateToken a propósito.
 */
router.get(
    "/api/v1/products/interaction/all",
    controller.listProductInteractionsAll,
);
router.get(
    "/api/v1/promotions/interaction/all",
    controller.listPromotionInteractionsAll,
);

module.exports = router;
