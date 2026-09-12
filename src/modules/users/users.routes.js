const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const controller = require("./users.controller");

const router = Router();

router.put(
    "/api/v1/users/me/fcm-token",
    authenticateToken,
    controller.putFcmToken,
);
router.delete(
    "/api/v1/users/me/fcm-token",
    authenticateToken,
    controller.deleteFcmToken,
);
router.get("/api/v1/users", authenticateToken, controller.listUsers);

module.exports = router;
