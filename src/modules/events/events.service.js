const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const { resolveImageUrl } = require("../../shared/images/presignedUrlCache");
const {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_PAGE_SIZES,
} = require("../../shared/validation/patterns");
const repository = require("./events.repository");

const EVENT_LIST_WHEN_VALUES = ["upcoming", "past"];

function requireNonEmptyString(value, field, maxLength) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AppError(400, `El campo '${field}' es obligatorio`);
    }
    if (value.trim().length > maxLength) {
        throw new AppError(
            400,
            `El campo '${field}' no puede superar los ${maxLength} caracteres`,
        );
    }
    return value.trim();
}

function requireOptionalString(value, field, maxLength) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (typeof value !== "string") {
        throw new AppError(400, `El campo '${field}' debe ser texto`);
    }
    if (value.length > maxLength) {
        throw new AppError(
            400,
            `El campo '${field}' no puede superar los ${maxLength} caracteres`,
        );
    }
    return value;
}

function requirePositiveInteger(value, field) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError(
            400,
            `El campo '${field}' debe ser un número entero positivo`,
        );
    }
    return parsed;
}

function requireBoolean(value, field) {
    if (typeof value !== "boolean") {
        throw new AppError(400, `El campo '${field}' debe ser verdadero o falso`);
    }
    return value;
}

function requireDate(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AppError(400, `El campo '${field}' es obligatorio`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new AppError(400, `El campo '${field}' debe ser una fecha válida`);
    }
    return date;
}

function requireIdList(value, field) {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new AppError(400, `El campo '${field}' debe ser una lista`);
    }
    return [...new Set(value.map((id) => requirePositiveInteger(id, field)))];
}

async function withTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Tipos de evento

async function runEventTypeWrite(operation) {
    try {
        return await operation();
    } catch (error) {
        if (error.code === "23505" && error.constraint === "event_type_name_key") {
            throw new AppError(409, "Ya existe un tipo de evento con ese nombre");
        }
        throw error;
    }
}

async function listEventTypes() {
    const eventTypes = await repository.listEventTypes(pool);
    return { eventTypes };
}

async function createEventType({ name }) {
    const validatedName = requireNonEmptyString(name, "name", 100);
    const eventType = await runEventTypeWrite(() =>
        repository.createEventType(pool, { name: validatedName }),
    );
    return { eventType };
}

async function updateEventType(id, { name }) {
    const eventTypeId = requirePositiveInteger(id, "id");
    const validatedName = requireNonEmptyString(name, "name", 100);

    const eventType = await runEventTypeWrite(() =>
        repository.updateEventType(pool, eventTypeId, { name: validatedName }),
    );

    if (!eventType) {
        throw new AppError(404, "El tipo de evento no fue encontrado");
    }

    return { eventType };
}

async function deleteEventType(id) {
    const eventTypeId = requirePositiveInteger(id, "id");

    const usageCount = await repository.countEventTypeUsage(pool, eventTypeId);
    if (usageCount > 0) {
        throw new AppError(
            409,
            "No se puede eliminar el tipo porque tiene eventos asociados",
        );
    }

    const deleted = await repository.deleteEventType(pool, eventTypeId);
    if (!deleted) {
        throw new AppError(404, "El tipo de evento no fue encontrado");
    }
}

// Eventos (admin)

function parseAdminListQuery(query) {
    let search = null;
    if (query.search !== undefined && query.search !== "") {
        search = String(query.search);
        if (!INTERACTION_TEXT_FILTER_REGEX.test(search)) {
            throw new AppError(
                400,
                "El parámetro 'search' contiene caracteres no permitidos",
            );
        }
        search = `%${search}%`;
    }

    let eventTypeId = null;
    if (query.eventTypeId !== undefined && query.eventTypeId !== "") {
        eventTypeId = requirePositiveInteger(query.eventTypeId, "eventTypeId");
    }

    let active = null;
    if (query.active !== undefined && query.active !== "") {
        if (query.active !== "true" && query.active !== "false") {
            throw new AppError(
                400,
                "El parámetro 'active' debe ser 'true' o 'false'",
            );
        }
        active = query.active === "true";
    }

    let when = null;
    if (query.when !== undefined && query.when !== "") {
        if (!EVENT_LIST_WHEN_VALUES.includes(query.when)) {
            throw new AppError(
                400,
                "El parámetro 'when' debe ser 'upcoming' o 'past'",
            );
        }
        when = query.when;
    }

    let page = Number.parseInt(query.page, 10);
    if (!Number.isInteger(page) || page < 1) {
        page = 1;
    }

    let pageSize = Number.parseInt(query.pageSize, 10);
    if (!INTERACTION_PAGE_SIZES.includes(pageSize)) {
        pageSize = 15;
    }

    return {
        search,
        eventTypeId,
        active,
        when,
        page,
        pageSize,
        offset: (page - 1) * pageSize,
    };
}

function validateEventPayload(body) {
    const title = requireNonEmptyString(body.title, "title", 150);
    const eventTypeId = requirePositiveInteger(body.eventTypeId, "eventTypeId");
    const description = requireOptionalString(
        body.description,
        "description",
        10000,
    );
    const location = requireOptionalString(body.location, "location", 200);
    const image = requireOptionalString(body.image, "image", 10000);
    const startAt = requireDate(body.startAt, "startAt");

    let endAt = null;
    if (body.endAt !== undefined && body.endAt !== null && body.endAt !== "") {
        endAt = requireDate(body.endAt, "endAt");
        if (endAt.getTime() < startAt.getTime()) {
            throw new AppError(
                400,
                "El campo 'endAt' debe ser igual o posterior a 'startAt'",
            );
        }
    }

    const productIds = requireIdList(body.productIds, "productIds");
    const promotionIds = requireIdList(body.promotionIds, "promotionIds");

    return {
        title,
        eventTypeId,
        description,
        location,
        image,
        startAt,
        endAt,
        productIds,
        promotionIds,
    };
}

async function runEventWrite(operation) {
    try {
        return await operation();
    } catch (error) {
        if (error.code === "23503" && error.constraint === "event_event_type_id_fkey") {
            throw new AppError(400, "El tipo de evento indicado no existe");
        }
        if (
            error.code === "23503" &&
            error.constraint === "event_product_product_id_fkey"
        ) {
            throw new AppError(
                400,
                "Uno de los productos indicados en 'productIds' no existe",
            );
        }
        if (
            error.code === "23503" &&
            error.constraint === "event_promotion_promotion_id_fkey"
        ) {
            throw new AppError(
                400,
                "Una de las promociones indicadas en 'promotionIds' no existe",
            );
        }
        throw error;
    }
}

async function attachLinkedIds(events) {
    const eventIds = events.map((event) => event.id);
    const [productRows, promotionRows] = await Promise.all([
        repository.findEventProductIdsByEventIds(pool, eventIds),
        repository.findEventPromotionIdsByEventIds(pool, eventIds),
    ]);

    const productIdsByEventId = new Map();
    for (const row of productRows) {
        const list = productIdsByEventId.get(row.eventId) ?? [];
        list.push(row.productId);
        productIdsByEventId.set(row.eventId, list);
    }

    const promotionIdsByEventId = new Map();
    for (const row of promotionRows) {
        const list = promotionIdsByEventId.get(row.eventId) ?? [];
        list.push(row.promotionId);
        promotionIdsByEventId.set(row.eventId, list);
    }

    return events.map((event) => ({
        ...event,
        productIds: productIdsByEventId.get(event.id) ?? [],
        promotionIds: promotionIdsByEventId.get(event.id) ?? [],
    }));
}

async function findEventAdminWithLinks(id) {
    const event = await repository.findEventAdminById(pool, id);
    if (!event) {
        return undefined;
    }
    const [withLinks] = await attachLinkedIds([event]);
    return withLinks;
}

async function listEvents(query) {
    const { page, pageSize, ...filters } = parseAdminListQuery(query);
    const rows = await repository.listEventsAdmin(pool, { ...filters, pageSize });

    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const items = rows.map(({ totalItems: _totalItems, ...row }) => row);

    return {
        items: await attachLinkedIds(items),
        pagination: { page, pageSize, totalItems, totalPages },
    };
}

async function createEvent(body) {
    const { productIds, promotionIds, ...payload } = validateEventPayload(body);

    const eventId = await runEventWrite(() =>
        withTransaction(async (client) => {
            const id = await repository.createEvent(client, payload);
            await repository.replaceEventProducts(client, id, productIds);
            await repository.replaceEventPromotions(client, id, promotionIds);
            return id;
        }),
    );

    return { event: await findEventAdminWithLinks(eventId) };
}

async function updateEvent(id, body) {
    const eventId = requirePositiveInteger(id, "id");
    const { productIds, promotionIds, ...payload } = validateEventPayload(body);
    const active = requireBoolean(body.active, "active");

    const updated = await runEventWrite(() =>
        withTransaction(async (client) => {
            const result = await repository.updateEvent(client, eventId, {
                ...payload,
                active,
            });
            if (!result) {
                return null;
            }
            await repository.replaceEventProducts(client, eventId, productIds);
            await repository.replaceEventPromotions(
                client,
                eventId,
                promotionIds,
            );
            return result;
        }),
    );

    if (!updated) {
        throw new AppError(404, "El evento no fue encontrado");
    }

    return { event: await findEventAdminWithLinks(eventId) };
}

async function deactivateEvent(id) {
    const eventId = requirePositiveInteger(id, "id");
    const deactivated = await repository.deactivateEvent(pool, eventId);

    if (!deactivated) {
        throw new AppError(404, "El evento no fue encontrado");
    }

    return { event: await findEventAdminWithLinks(eventId) };
}

// Público

async function listUpcomingEvents(query) {
    let limit = null;
    if (query.limit !== undefined && query.limit !== "") {
        limit = requirePositiveInteger(query.limit, "limit");
    }

    const events = await repository.listUpcomingEvents(pool, { limit });

    return Promise.all(
        events.map(async (event) => ({
            ...event,
            image: await resolveImageUrl(event.image),
        })),
    );
}

async function getUpcomingEventById(id) {
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        throw new AppError(404, "Evento no encontrado");
    }

    const event = await repository.findUpcomingEventById(pool, eventId);
    if (!event) {
        throw new AppError(404, "Evento no encontrado");
    }

    const [products, promotions] = await Promise.all([
        repository.findActiveEventProducts(pool, eventId),
        repository.findActiveEventPromotions(pool, eventId),
    ]);

    return {
        ...event,
        image: await resolveImageUrl(event.image),
        products: await Promise.all(
            products.map(async (product) => ({
                ...product,
                image: await resolveImageUrl(product.image),
            })),
        ),
        promotions: await Promise.all(
            promotions.map(async (promotion) => ({
                ...promotion,
                image: await resolveImageUrl(promotion.image),
            })),
        ),
    };
}

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
