const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const { parseInteractionListQuery } = require("../../shared/validation/listQuery");
const service = require("./notifications.service");

const postSend = asyncHandler(async (req, res) => {
    const { title, body, imageUrl, target, userIds } = req.body ?? {};

    if (
        typeof title !== "string" ||
        title.trim().length === 0 ||
        title.length > 65
    ) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El título es obligatorio y debe tener como máximo 65 caracteres",
        });
    }

    if (
        typeof body !== "string" ||
        body.trim().length === 0 ||
        body.length > 240
    ) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El cuerpo es obligatorio y debe tener como máximo 240 caracteres",
        });
    }

    if (target !== "all" && target !== "users") {
        return sendError(res, req, {
            statusCode: 400,
            message: "El destino debe ser 'all' o 'users'",
        });
    }

    if (
        target === "users" &&
        (!Array.isArray(userIds) ||
            userIds.length === 0 ||
            !userIds.every((id) => Number.isInteger(id)))
    ) {
        return sendError(res, req, {
            statusCode: 400,
            message: "Para el destino 'users' se requiere una lista no vacía de userIds",
        });
    }

    const result = await service.sendNotification({
        title,
        body,
        imageUrl,
        target,
        userIds,
        sentByUserId: req.authenticatedUser.sub,
    });

    return sendSuccess(res, req, {
        message: "Notificación procesada exitosamente",
        data: result,
    });
});

const getLog = asyncHandler(async (req, res) => {
    const filters = parseInteractionListQuery(req, res, { entityParam: "title" });
    if (!filters) {
        return;
    }

    const conditions = [];
    const params = [];

    if (filters.entityValue) {
        params.push(`%${filters.entityValue}%`);
        conditions.push(`nl.title ILIKE $${params.length}`);
    }
    if (filters.username) {
        params.push(`%${filters.username}%`);
        conditions.push(`
            EXISTS (
                SELECT 1
                FROM public.notification_log_recipient nlr
                INNER JOIN public."user" ru ON ru.id = nlr.user_id
                WHERE nlr.notification_log_id = nl.id
                    AND ru.username ILIKE $${params.length}
            )
        `);
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        conditions.push(`nl.created_at >= $${params.length}::date`);
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        conditions.push(`nl.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(filters.pageSize);
    const limitParamIndex = params.length;
    params.push((filters.page - 1) * filters.pageSize);
    const offsetParamIndex = params.length;

    const result = await service.listNotificationLogs({
        whereClause,
        params,
        limitParamIndex,
        offsetParamIndex,
        page: filters.page,
        pageSize: filters.pageSize,
    });

    return sendSuccess(res, req, {
        message: "Historial de notificaciones recuperado exitosamente",
        data: result,
    });
});

const deleteLog = asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El id del registro debe ser un número entero",
        });
    }

    await service.deleteNotificationLog(id);

    return sendSuccess(res, req, {
        message: "Registro de notificación eliminado exitosamente",
        data: { id },
    });
});

const postPersonalizedRun = asyncHandler(async (req, res) => {
    const result = await service.runPersonalizedRun();

    return sendSuccess(res, req, {
        message: result.skipped
            ? "Ya hay un ciclo en curso"
            : "Ciclo de notificaciones personalizadas ejecutado exitosamente",
        data: result,
    });
});

module.exports = { postSend, getLog, deleteLog, postPersonalizedRun };
