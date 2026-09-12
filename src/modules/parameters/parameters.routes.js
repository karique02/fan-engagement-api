const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./parameters.controller");

const router = Router();

router.get(
    "/api/v1/parameters/personalized-notifications",
    authenticateToken,
    controller.getPersonalizedNotifications,
);
router.put(
    "/api/v1/parameters/personalized-notifications",
    authenticateToken,
    controller.putPersonalizedNotifications,
);

module.exports = router;
