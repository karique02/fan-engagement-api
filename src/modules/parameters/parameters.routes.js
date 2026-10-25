const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./parameters.controller");

const router = Router();

router.get(
    "/api/v1/parameters/personalized-notifications",
    authenticateToken,
    requireAdmin,
    controller.getPersonalizedNotifications,
);
router.put(
    "/api/v1/parameters/personalized-notifications",
    authenticateToken,
    requireAdmin,
    controller.putPersonalizedNotifications,
);
router.get(
    "/api/v1/parameters/free-membership",
    authenticateToken,
    requireAdmin,
    controller.getFreeMembership,
);
router.put(
    "/api/v1/parameters/free-membership",
    authenticateToken,
    requireAdmin,
    controller.putFreeMembership,
);
router.get(
    "/api/v1/parameters/free-shipping-notice",
    authenticateToken,
    requireAdmin,
    controller.getFreeShippingNotice,
);
router.put(
    "/api/v1/parameters/free-shipping-notice",
    authenticateToken,
    requireAdmin,
    controller.putFreeShippingNotice,
);

module.exports = router;
