const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./cart.controller");

const router = Router();

router.get("/api/v1/cart", authenticateToken, controller.getCart);
router.post("/api/v1/cart/products", authenticateToken, controller.addProduct);
router.post(
    "/api/v1/cart/promotions",
    authenticateToken,
    controller.addPromotion,
);
router.patch(
    "/api/v1/cart/items/:cartItemId",
    authenticateToken,
    controller.updateItemQuantity,
);
router.delete(
    "/api/v1/cart/items/:cartItemId",
    authenticateToken,
    controller.deleteItem,
);
router.delete("/api/v1/cart", authenticateToken, controller.clearCart);

module.exports = router;
