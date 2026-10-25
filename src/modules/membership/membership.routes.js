const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireFan = require("../../shared/middlewares/requireFan");
const controller = require("./membership.controller");

const router = Router();

router.get(
    "/api/v1/membership/me",
    authenticateToken,
    requireFan,
    controller.getMe,
);
router.post(
    "/api/v1/membership/trial",
    authenticateToken,
    requireFan,
    controller.postTrial,
);
router.get(
    "/api/v1/membership/promotions",
    authenticateToken,
    requireFan,
    controller.getPromotions,
);

module.exports = router;
