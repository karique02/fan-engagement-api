const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./membership.controller");

const router = Router();

router.get("/api/v1/membership/me", authenticateToken, controller.getMe);
router.post("/api/v1/membership/trial", authenticateToken, controller.postTrial);
router.get(
    "/api/v1/membership/promotions",
    authenticateToken,
    controller.getPromotions,
);

module.exports = router;
