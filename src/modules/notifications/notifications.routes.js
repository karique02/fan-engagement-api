const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./notifications.controller");

const router = Router();

router.post(
    "/api/v1/notifications/send",
    authenticateToken,
    requireAdmin,
    controller.postSend,
);
router.get(
    "/api/v1/notifications/log",
    authenticateToken,
    requireAdmin,
    controller.getLog,
);
router.delete(
    "/api/v1/notifications/log/:id",
    authenticateToken,
    requireAdmin,
    controller.deleteLog,
);
router.post(
    "/api/v1/notifications/personalized/run",
    authenticateToken,
    requireAdmin,
    controller.postPersonalizedRun,
);

module.exports = router;
