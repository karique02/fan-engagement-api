const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./notifications.controller");

const router = Router();

router.post("/api/v1/notifications/send", authenticateToken, controller.postSend);
router.get("/api/v1/notifications/log", authenticateToken, controller.getLog);
router.delete(
    "/api/v1/notifications/log/:id",
    authenticateToken,
    controller.deleteLog,
);
router.post(
    "/api/v1/notifications/personalized/run",
    authenticateToken,
    controller.postPersonalizedRun,
);

module.exports = router;
