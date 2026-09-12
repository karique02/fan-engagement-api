const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./images.controller");

const router = Router();

router.get("/api/v1/images", authenticateToken, controller.listImages);

module.exports = router;
