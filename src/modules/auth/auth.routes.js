const { Router } = require("express");
const controller = require("./auth.controller");

const router = Router();

router.post("/api/v1/auth/register", controller.register);
router.post("/api/v1/auth/login", controller.login);
router.get("/api/v1/auth/verify-email", controller.verifyEmail);
router.post(
    "/api/v1/auth/resend-email-verification",
    controller.resendEmailVerification,
);

module.exports = router;
