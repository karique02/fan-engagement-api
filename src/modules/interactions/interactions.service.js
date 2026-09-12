const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const repository = require("./interactions.repository");

async function createProductInteraction({ userId, productId, rating }) {
    try {
        return await repository.upsertProductInteraction(pool, {
            userId,
            productId,
            rating,
        });
    } catch (error) {
        if (
            error.code === "23503" &&
            error.constraint === "fk_user_product_interaction_product"
        ) {
            throw new AppError(404, "El producto no fue encontrado");
        }

        if (
            error.code === "23503" &&
            error.constraint === "fk_user_product_interaction_user"
        ) {
            throw new AppError(401, "El usuario autenticado no fue encontrado");
        }

        throw error;
    }
}

async function createPromotionInteraction({ userId, promotionId, rating }) {
    try {
        return await repository.upsertPromotionInteraction(pool, {
            userId,
            promotionId,
            rating,
        });
    } catch (error) {
        if (error.code === "23503") {
            throw new AppError(
                404,
                "Promoción o usuario autenticado no fueron encontrados",
            );
        }

        throw error;
    }
}

function buildFilterQuery(filters, { usernameColumn, entityColumn, dateColumn }) {
    const conditions = [];
    const params = [];

    if (filters.username) {
        params.push(`%${filters.username}%`);
        conditions.push(`${usernameColumn} ILIKE $${params.length}`);
    }
    if (filters.entityValue) {
        params.push(`%${filters.entityValue}%`);
        conditions.push(`${entityColumn} ILIKE $${params.length}`);
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        conditions.push(`${dateColumn} >= $${params.length}::date`);
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        conditions.push(`${dateColumn} < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(filters.pageSize);
    const limitParamIndex = params.length;
    params.push((filters.page - 1) * filters.pageSize);
    const offsetParamIndex = params.length;

    return { whereClause, params, limitParamIndex, offsetParamIndex };
}

function paginate(rows, filters) {
    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
    const items = rows.map(({ totalItems: _totalItems, ...row }) => row);

    return {
        items,
        pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            totalItems,
            totalPages,
        },
    };
}

async function listProductInteractionsAll(filters) {
    const query = buildFilterQuery(filters, {
        usernameColumn: "u.username",
        entityColumn: "p.name",
        dateColumn: "upi.last_interaction_at",
    });

    const rows = await repository.listProductInteractions(pool, query);

    return paginate(rows, filters);
}

async function listPromotionInteractionsAll(filters) {
    const query = buildFilterQuery(filters, {
        usernameColumn: "u.username",
        entityColumn: "p.title",
        dateColumn: "upi.last_interaction_at",
    });

    const rows = await repository.listPromotionInteractions(pool, query);

    return paginate(rows, filters);
}

module.exports = {
    createProductInteraction,
    createPromotionInteraction,
    listProductInteractionsAll,
    listPromotionInteractionsAll,
};
