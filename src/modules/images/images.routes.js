const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./images.controller");
const uploadSingleImage = require("./imagesUpload.middleware");
const imagesUploadRateLimit = require("./imagesUploadRateLimit.middleware");

const router = Router();

router.get("/api/v1/images", authenticateToken, controller.listImages);

router.use("/api/v1/admin/images", authenticateToken, requireAdmin);

router.post(
    "/api/v1/admin/images",
    imagesUploadRateLimit,
    uploadSingleImage,
    controller.uploadImage,
);
router.get("/api/v1/admin/images/:id/usage", controller.getImageUsage);
router.delete("/api/v1/admin/images/:id", controller.deleteImage);

module.exports = router;
