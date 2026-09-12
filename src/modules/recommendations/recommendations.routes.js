const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./recommendations.controller");

const router = Router();

router.post("/api/v1/recommendations/train", controller.postTrain);
router.get(
    "/api/v1/products/recommendations",
    authenticateToken,
    controller.getProductRecommendations,
);
router.get(
    "/api/v1/promotions/recommendations",
    authenticateToken,
    controller.getPromotionRecommendations,
);

module.exports = router;
