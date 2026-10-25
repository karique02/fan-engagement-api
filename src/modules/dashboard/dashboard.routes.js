const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./dashboard.controller");

const router = Router();

router.get(
    "/api/v1/dashboard/engagement",
    authenticateToken,
    requireAdmin,
    controller.getEngagement,
);
router.get(
    "/api/v1/dashboard/engagement/user/:userId",
    authenticateToken,
    requireAdmin,
    controller.getUserEngagement,
);

module.exports = router;
