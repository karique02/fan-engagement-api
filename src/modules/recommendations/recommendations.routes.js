const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./recommendations.controller");

const router = Router();

router.post(
    "/api/v1/recommendations/train",
    authenticateToken,
    requireAdmin,
    controller.postTrain,
);
router.get(
    "/api/v1/products/recommendations",
    authenticateToken,
    requireFan,
    controller.getProductRecommendations,
);
router.get(
    "/api/v1/promotions/recommendations",
    authenticateToken,
    requireFan,
    controller.getPromotionRecommendations,
);

module.exports = router;
