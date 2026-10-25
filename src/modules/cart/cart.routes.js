const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./cart.controller");

const router = Router();

router.get("/api/v1/cart", authenticateToken, requireFan, controller.getCart);
router.post(
    "/api/v1/cart/products",
    authenticateToken,
    requireFan,
    controller.addProduct,
);
router.post(
    "/api/v1/cart/promotions",
    authenticateToken,
    requireFan,
    controller.addPromotion,
);
router.patch(
    "/api/v1/cart/items/:cartItemId",
    authenticateToken,
    requireFan,
    controller.updateItemQuantity,
);
router.delete(
    "/api/v1/cart/items/:cartItemId",
    authenticateToken,
    requireFan,
    controller.deleteItem,
);
router.delete(
    "/api/v1/cart",
    authenticateToken,
    requireFan,
    controller.clearCart,
);

module.exports = router;
