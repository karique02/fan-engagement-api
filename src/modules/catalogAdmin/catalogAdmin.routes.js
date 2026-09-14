const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./catalogAdmin.controller");

const router = Router();

router.use("/api/v1/admin", authenticateToken, requireAdmin);

router.get("/api/v1/admin/products", controller.listProducts);
router.post("/api/v1/admin/products", controller.createProduct);
router.put("/api/v1/admin/products/:id", controller.updateProduct);
router.delete("/api/v1/admin/products/:id", controller.deactivateProduct);

router.get(
    "/api/v1/admin/product-categories",
    controller.listProductCategories,
);
router.post(
    "/api/v1/admin/product-categories",
    controller.createProductCategory,
);
router.put(
    "/api/v1/admin/product-categories/:id",
    controller.updateProductCategory,
);
router.delete(
    "/api/v1/admin/product-categories/:id",
    controller.deleteProductCategory,
);

router.get("/api/v1/admin/promotions", controller.listPromotions);
router.post("/api/v1/admin/promotions", controller.createPromotion);
router.put("/api/v1/admin/promotions/:id", controller.updatePromotion);
router.delete("/api/v1/admin/promotions/:id", controller.deactivatePromotion);

router.get(
    "/api/v1/admin/promotion-categories",
    controller.listPromotionCategories,
);
router.post(
    "/api/v1/admin/promotion-categories",
    controller.createPromotionCategory,
);
router.put(
    "/api/v1/admin/promotion-categories/:id",
    controller.updatePromotionCategory,
);
router.delete(
    "/api/v1/admin/promotion-categories/:id",
    controller.deletePromotionCategory,
);

router.get(
    "/api/v1/admin/member-promotions",
    controller.listMemberPromotions,
);
router.post(
    "/api/v1/admin/member-promotions",
    controller.createMemberPromotion,
);
router.put(
    "/api/v1/admin/member-promotions/:id",
    controller.updateMemberPromotion,
);
router.delete(
    "/api/v1/admin/member-promotions/:id",
    controller.deactivateMemberPromotion,
);

module.exports = router;
