const { Router } = require("express");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const controller = require("./events.controller");

const router = Router();

router.get("/api/v1/events", authenticateToken, controller.listUpcomingEvents);
router.get(
    "/api/v1/events/:id",
    authenticateToken,
    controller.getUpcomingEventById,
);

router.use("/api/v1/admin/events", authenticateToken, requireAdmin);
router.use("/api/v1/admin/event-types", authenticateToken, requireAdmin);

router.get("/api/v1/admin/events", controller.listEvents);
router.post("/api/v1/admin/events", controller.createEvent);
router.put("/api/v1/admin/events/:id", controller.updateEvent);
router.delete("/api/v1/admin/events/:id", controller.deactivateEvent);

router.get("/api/v1/admin/event-types", controller.listEventTypes);
router.post("/api/v1/admin/event-types", controller.createEventType);
router.put("/api/v1/admin/event-types/:id", controller.updateEventType);
router.delete("/api/v1/admin/event-types/:id", controller.deleteEventType);

module.exports = router;
