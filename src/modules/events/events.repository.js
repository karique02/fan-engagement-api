// Tipos de evento

async function listEventTypes(pool) {
    const result = await pool.query(`
        SELECT id, name
        FROM public.event_type
        ORDER BY name;
    `);

    return result.rows;
}

async function createEventType(pool, { name }) {
    const result = await pool.query(
        `
            INSERT INTO public.event_type (name)
            VALUES ($1)
            RETURNING id, name;
        `,
        [name],
    );

    return result.rows[0];
}

async function updateEventType(pool, id, { name }) {
    const result = await pool.query(
        `
            UPDATE public.event_type
            SET name = $1
            WHERE id = $2
            RETURNING id, name;
        `,
        [name, id],
    );

    return result.rows[0];
}

async function countEventTypeUsage(pool, id) {
    const result = await pool.query(
        `
            SELECT COUNT(*)::integer AS count
            FROM public.event
            WHERE event_type_id = $1;
        `,
        [id],
    );

    return result.rows[0].count;
}

async function deleteEventType(pool, id) {
    const result = await pool.query(
        `
            DELETE FROM public.event_type
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    return result.rows[0];
}

// Eventos

const EVENT_COLUMNS = `
    e.id,
    e.title,
    e.event_type_id AS "eventTypeId",
    et.name AS "eventTypeName",
    e.description,
    e.location,
    e.image,
    e.start_at AS "startAt",
    e.end_at AS "endAt"
`;

async function listEventsAdmin(
    pool,
    { search, eventTypeId, active, when, pageSize, offset },
) {
    const result = await pool.query(
        `
            SELECT
                ${EVENT_COLUMNS},
                e.active,
                e.created_at AS "createdAt",
                COUNT(*) OVER() AS "totalItems"
            FROM public.event e
            INNER JOIN public.event_type et
                ON et.id = e.event_type_id
            WHERE ($1::text IS NULL OR e.title ILIKE $1)
              AND ($2::bigint IS NULL OR e.event_type_id = $2)
              AND ($3::boolean IS NULL OR e.active = $3)
              AND (
                  $4::text IS NULL
                  OR ($4 = 'upcoming' AND COALESCE(e.end_at, e.start_at) >= NOW())
                  OR ($4 = 'past' AND COALESCE(e.end_at, e.start_at) < NOW())
              )
            ORDER BY e.start_at DESC, e.id DESC
            LIMIT $5 OFFSET $6;
        `,
        [
            search ?? null,
            eventTypeId ?? null,
            active ?? null,
            when ?? null,
            pageSize,
            offset,
        ],
    );

    return result.rows;
}

async function findEventAdminById(pool, id) {
    const result = await pool.query(
        `
            SELECT
                ${EVENT_COLUMNS},
                e.active,
                e.created_at AS "createdAt"
            FROM public.event e
            INNER JOIN public.event_type et
                ON et.id = e.event_type_id
            WHERE e.id = $1;
        `,
        [id],
    );

    return result.rows[0];
}

async function findEventProductIdsByEventIds(pool, eventIds) {
    if (eventIds.length === 0) {
        return [];
    }

    const result = await pool.query(
        `
            SELECT event_id AS "eventId", product_id AS "productId"
            FROM public.event_product
            WHERE event_id = ANY($1::bigint[])
            ORDER BY event_id, product_id;
        `,
        [eventIds],
    );

    return result.rows;
}

async function findEventPromotionIdsByEventIds(pool, eventIds) {
    if (eventIds.length === 0) {
        return [];
    }

    const result = await pool.query(
        `
            SELECT event_id AS "eventId", promotion_id AS "promotionId"
            FROM public.event_promotion
            WHERE event_id = ANY($1::bigint[])
            ORDER BY event_id, promotion_id;
        `,
        [eventIds],
    );

    return result.rows;
}

async function createEvent(
    client,
    { title, eventTypeId, description, location, image, startAt, endAt },
) {
    const result = await client.query(
        `
            INSERT INTO public.event (
                title,
                event_type_id,
                description,
                location,
                image,
                start_at,
                end_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `,
        [title, eventTypeId, description, location, image, startAt, endAt],
    );

    return result.rows[0].id;
}

async function updateEvent(
    client,
    id,
    { title, eventTypeId, description, location, image, startAt, endAt, active },
) {
    const result = await client.query(
        `
            UPDATE public.event
            SET
                title = $1,
                event_type_id = $2,
                description = $3,
                location = $4,
                image = $5,
                start_at = $6,
                end_at = $7,
                active = $8
            WHERE id = $9
            RETURNING id;
        `,
        [
            title,
            eventTypeId,
            description,
            location,
            image,
            startAt,
            endAt,
            active,
            id,
        ],
    );

    return result.rows[0];
}

async function deactivateEvent(pool, id) {
    const result = await pool.query(
        `
            UPDATE public.event
            SET active = false
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    return result.rows[0];
}

async function replaceEventProducts(client, eventId, productIds) {
    await client.query(
        `DELETE FROM public.event_product WHERE event_id = $1;`,
        [eventId],
    );

    if (productIds.length === 0) {
        return;
    }

    await client.query(
        `
            INSERT INTO public.event_product (event_id, product_id)
            SELECT $1, UNNEST($2::bigint[]);
        `,
        [eventId, productIds],
    );
}

async function replaceEventPromotions(client, eventId, promotionIds) {
    await client.query(
        `DELETE FROM public.event_promotion WHERE event_id = $1;`,
        [eventId],
    );

    if (promotionIds.length === 0) {
        return;
    }

    await client.query(
        `
            INSERT INTO public.event_promotion (event_id, promotion_id)
            SELECT $1, UNNEST($2::bigint[]);
        `,
        [eventId, promotionIds],
    );
}

// Público

async function listUpcomingEvents(pool, { limit }) {
    const result = await pool.query(
        `
            SELECT ${EVENT_COLUMNS}
            FROM public.event e
            INNER JOIN public.event_type et
                ON et.id = e.event_type_id
            WHERE e.active = true
              AND COALESCE(e.end_at, e.start_at) >= NOW()
            ORDER BY e.start_at ASC, e.id ASC
            LIMIT $1;
        `,
        [limit ?? null],
    );

    return result.rows;
}

async function findUpcomingEventById(pool, id) {
    const result = await pool.query(
        `
            SELECT ${EVENT_COLUMNS}
            FROM public.event e
            INNER JOIN public.event_type et
                ON et.id = e.event_type_id
            WHERE e.id = $1
              AND e.active = true
              AND COALESCE(e.end_at, e.start_at) >= NOW();
        `,
        [id],
    );

    return result.rows[0];
}

async function findActiveEventProducts(pool, eventId) {
    const result = await pool.query(
        `
            SELECT
                p.id,
                p.name,
                p.product_category_id AS "productCategoryId",
                pc.name AS "productCategoryName",
                p.price,
                p.image,
                p.description,
                p.active
            FROM public.event_product ep
            INNER JOIN public.product p
                ON p.id = ep.product_id
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            WHERE ep.event_id = $1
              AND p.active = true
            ORDER BY p.id;
        `,
        [eventId],
    );

    return result.rows;
}

async function findActiveEventPromotions(pool, eventId) {
    const result = await pool.query(
        `
            SELECT
                p.id,
                p.title,
                p.buy_quantity AS "buyQuantity",
                p.pay_quantity AS "payQuantity",
                p.discount_percentage AS "discountPercentage",
                p.promotion_category_id AS "promotionCategoryId",
                pc.name AS "promotionCategoryName",
                p.description,
                p.image,
                p.deadline,
                p.active
            FROM public.event_promotion ep
            INNER JOIN public.promotion p
                ON p.id = ep.promotion_id
            INNER JOIN public.promotion_category pc
                ON pc.id = p.promotion_category_id
            WHERE ep.event_id = $1
              AND p.active = true
              AND p.deadline >= NOW()
            ORDER BY p.id;
        `,
        [eventId],
    );

    return result.rows;
}

module.exports = {
    listEventTypes,
    createEventType,
    updateEventType,
    countEventTypeUsage,
    deleteEventType,
    listEventsAdmin,
    findEventAdminById,
    findEventProductIdsByEventIds,
    findEventPromotionIdsByEventIds,
    createEvent,
    updateEvent,
    deactivateEvent,
    replaceEventProducts,
    replaceEventPromotions,
    listUpcomingEvents,
    findUpcomingEventById,
    findActiveEventProducts,
    findActiveEventPromotions,
};
