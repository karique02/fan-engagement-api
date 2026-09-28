const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./events.service");

// Tipos de evento

const listEventTypes = asyncHandler(async (req, res) => {
    const data = await service.listEventTypes();
    return sendSuccess(res, req, {
        message: "Tipos de evento recuperados exitosamente",
        data,
    });
});

const createEventType = asyncHandler(async (req, res) => {
    const data = await service.createEventType(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Tipo de evento creado exitosamente",
        data,
    });
});

const updateEventType = asyncHandler(async (req, res) => {
    const data = await service.updateEventType(req.params.id, req.body ?? {});
    return sendSuccess(res, req, {
        message: "Tipo de evento actualizado exitosamente",
        data,
    });
});

const deleteEventType = asyncHandler(async (req, res) => {
    await service.deleteEventType(req.params.id);
    return sendSuccess(res, req, {
        message: "Tipo de evento eliminado exitosamente",
    });
});

// Eventos (admin)

const listEvents = asyncHandler(async (req, res) => {
    const data = await service.listEvents(req.query);
    return sendSuccess(res, req, {
        message: "Eventos recuperados exitosamente",
        data,
    });
});

const createEvent = asyncHandler(async (req, res) => {
    const data = await service.createEvent(req.body ?? {});
    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Evento creado exitosamente",
        data,
    });
});

const updateEvent = asyncHandler(async (req, res) => {
    const data = await service.updateEvent(req.params.id, req.body ?? {});
    return sendSuccess(res, req, {
        message: "Evento actualizado exitosamente",
        data,
    });
});

const deactivateEvent = asyncHandler(async (req, res) => {
    const data = await service.deactivateEvent(req.params.id);
    return sendSuccess(res, req, {
        message: "Evento desactivado exitosamente",
        data,
    });
});

// Público

const listUpcomingEvents = asyncHandler(async (req, res) => {
    const events = await service.listUpcomingEvents(req.query);
    return sendSuccess(res, req, {
        message: "Eventos recuperados exitosamente",
        data: { events },
    });
});

const getUpcomingEventById = asyncHandler(async (req, res) => {
    const event = await service.getUpcomingEventById(req.params.id);
    return sendSuccess(res, req, {
        message: "Evento recuperado exitosamente",
        data: { event },
    });
});

module.exports = {
    listEventTypes,
    createEventType,
    updateEventType,
    deleteEventType,
    listEvents,
    createEvent,
    updateEvent,
    deactivateEvent,
    listUpcomingEvents,
    getUpcomingEventById,
};
