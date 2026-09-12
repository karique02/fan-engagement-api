const { Router } = require("express");
const { getRoot, getHealth } = require("./health.controller");

const router = Router();

router.get("/", getRoot);
router.get("/api/v1/health", getHealth);

module.exports = router;
