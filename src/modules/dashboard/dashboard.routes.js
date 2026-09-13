const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./dashboard.controller");

const router = Router();

router.get(
    "/api/v1/dashboard/engagement",
    authenticateToken,
    controller.getEngagement,
);
router.get(
    "/api/v1/dashboard/engagement/user/:userId",
    authenticateToken,
    controller.getUserEngagement,
);

module.exports = router;
