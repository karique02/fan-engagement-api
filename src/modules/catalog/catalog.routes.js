const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./catalog.controller");

const router = Router();

router.get("/api/v1/products", authenticateToken, controller.listProducts);
router.get("/api/v1/promotions", authenticateToken, controller.listPromotions);
router.get("/api/v1/products/:id", authenticateToken, controller.getProductById);
router.get("/api/v1/promotions/:id", authenticateToken, controller.getPromotionById);

module.exports = router;
