const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./catalog.controller");

const router = Router();

router.get("/api/v1/products", authenticateToken, controller.listProducts);
router.get("/api/v1/promotions", authenticateToken, controller.listPromotions);

module.exports = router;
