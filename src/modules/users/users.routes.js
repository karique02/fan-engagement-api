const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./users.controller");

const router = Router();

router.put(
    "/api/v1/users/me/fcm-token",
    authenticateToken,
    requireFan,
    controller.putFcmToken,
);
router.delete(
    "/api/v1/users/me/fcm-token",
    authenticateToken,
    requireFan,
    controller.deleteFcmToken,
);
router.get(
    "/api/v1/users/fans",
    authenticateToken,
    requireAdmin,
    controller.listFans,
);
router.get(
    "/api/v1/users",
    authenticateToken,
    requireAdmin,
    controller.listUsers,
);

module.exports = router;
