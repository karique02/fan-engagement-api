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
router.get(
    "/api/v1/parameters/free-membership",
    authenticateToken,
    controller.getFreeMembership,
);
router.put(
    "/api/v1/parameters/free-membership",
    authenticateToken,
    controller.putFreeMembership,
);
router.get(
    "/api/v1/parameters/free-shipping-notice",
    authenticateToken,
    controller.getFreeShippingNotice,
);
router.put(
    "/api/v1/parameters/free-shipping-notice",
    authenticateToken,
    controller.putFreeShippingNotice,
);

module.exports = router;
