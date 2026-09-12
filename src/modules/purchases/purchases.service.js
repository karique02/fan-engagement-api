const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_DATE_REGEX,
    INTERACTION_PAGE_SIZES,
    PURCHASE_STATUSES,
} = require("../../shared/validation/patterns");
const repository = require("./purchases.repository");

/*
 * Protegido.
 *
 * Checkout: convierte el carrito del usuario autenticado en una compra
 * (status = 'pending') y lo vacía, todo en una transacción.
 */
async function checkout(userId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const cart = await repository.findCartByUserId(client, userId);

        if (!cart) {
            await client.query("ROLLBACK");
            throw new AppError(400, "El carrito está vacío");
        }

        const cartItemRows = await repository.findCartItemsForCheckout(
            client,
            cart.id,
        );

        if (cartItemRows.length === 0) {
            await client.query("ROLLBACK");
            throw new AppError(400, "El carrito está vacío");
        }

        const preparedItems = cartItemRows.map((row) => {
            const isProduct = row.itemType === "product";
            const itemName = isProduct ? row.productName : row.promotionTitle;
            const unitPrice = Number(
                (isProduct ? row.productPrice : row.promotionUnitPrice) ?? 0,
            );
            const lineTotal = unitPrice * row.quantity;

            return {
                productId: isProduct ? row.productId : null,
                promotionId: isProduct ? null : row.promotionId,
                itemName,
                quantity: row.quantity,
                unitPrice,
                lineTotal,
            };
        });

        const totalAmount = preparedItems.reduce(
            (sum, item) => sum + item.lineTotal,
            0,
        );
        const itemCount = preparedItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
        );

        const purchase = await repository.insertPurchase(client, {
            userId,
            totalAmount,
            itemCount,
        });

        for (const item of preparedItems) {
            await repository.insertPurchaseItem(client, {
                purchaseId: purchase.id,
                ...item,
            });
        }

        await repository.deleteCartItemsByCartId(client, cart.id);
        await repository.touchCartUpdatedAtById(client, cart.id);

        await client.query("COMMIT");

        const itemsByPurchaseId = await repository.fetchPurchaseItemsByPurchaseIds(
            pool,
            [purchase.id],
        );

        return {
            ...purchase,
            totalAmount: Number(purchase.totalAmount),
            items: itemsByPurchaseId.get(purchase.id) ?? [],
        };
    } catch (error) {
        if (!(error instanceof AppError)) {
            await client.query("ROLLBACK");
        }
        throw error;
    } finally {
        client.release();
    }
}

/*
 * Público (mismo criterio que products/interaction/all): historial global de
 * compras, paginado y filtrable por usuario, rango de fechas y estado.
 * Consumo: web admin.
 */
async function listPurchases(query) {
    let username;
    if (query.username !== undefined && query.username !== "") {
        username = String(query.username);
        if (!INTERACTION_TEXT_FILTER_REGEX.test(username)) {
            throw new AppError(
                400,
                "El parámetro 'username' contiene caracteres no permitidos",
            );
        }
    }

    const readDate = (paramName) => {
        const raw = query[paramName];
        if (raw === undefined || raw === "") {
            return undefined;
        }
        const value = String(raw);
        if (!INTERACTION_DATE_REGEX.test(value)) {
            throw new AppError(
                400,
                `El parámetro '${paramName}' debe tener el formato YYYY-MM-DD`,
            );
        }
        return value;
    };

    const dateFrom = readDate("dateFrom");
    const dateTo = readDate("dateTo");

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new AppError(
            400,
            "La fecha 'desde' no puede ser posterior a la fecha 'hasta'",
        );
    }

    let status;
    if (query.status !== undefined && query.status !== "") {
        status = String(query.status);
        if (!PURCHASE_STATUSES.includes(status)) {
            throw new AppError(
                400,
                "El parámetro 'status' debe ser uno de: pending, completed, cancelled",
            );
        }
    }

    let page = Number.parseInt(query.page, 10);
    if (!Number.isInteger(page) || page < 1) {
        page = 1;
    }

    let pageSize = Number.parseInt(query.pageSize, 10);
    if (!INTERACTION_PAGE_SIZES.includes(pageSize)) {
        pageSize = 15;
    }

    const conditions = [];
    const params = [];

    if (username) {
        params.push(`%${username}%`);
        conditions.push(`u.username ILIKE $${params.length}`);
    }
    if (dateFrom) {
        params.push(dateFrom);
        conditions.push(`p.created_at >= $${params.length}::date`);
    }
    if (dateTo) {
        params.push(dateTo);
        conditions.push(`p.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (status) {
        params.push(status);
        conditions.push(`p.status = $${params.length}`);
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(pageSize);
    const limitParamIndex = params.length;
    params.push((page - 1) * pageSize);
    const offsetParamIndex = params.length;

    const rows = await repository.listPurchases(pool, {
        whereClause,
        params,
        limitParamIndex,
        offsetParamIndex,
    });

    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const purchases = rows.map(({ totalItems: _totalItems, totalAmount, ...row }) => ({
        ...row,
        totalAmount: Number(totalAmount),
    }));

    return {
        purchases,
        pagination: { page, pageSize, totalItems, totalPages },
    };
}

/*
 * Protegido.
 *
 * Historial de compras del usuario autenticado, paginado, sin filtros,
 * incluyendo los ítems de cada compra. Consumo: Android.
 */
async function listMyPurchases({ userId, query }) {
    let page = Number.parseInt(query.page, 10);
    if (!Number.isInteger(page) || page < 1) {
        page = 1;
    }

    let pageSize = Number.parseInt(query.pageSize, 10);
    if (!INTERACTION_PAGE_SIZES.includes(pageSize)) {
        pageSize = 15;
    }

    const rows = await repository.listPurchasesByUserId(pool, {
        userId,
        pageSize,
        offset: (page - 1) * pageSize,
    });

    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    const purchaseIds = rows.map((row) => row.id);
    const itemsByPurchaseId = await repository.fetchPurchaseItemsByPurchaseIds(
        pool,
        purchaseIds,
    );

    const purchases = rows.map(({ totalItems: _totalItems, totalAmount, ...row }) => ({
        ...row,
        totalAmount: Number(totalAmount),
        items: itemsByPurchaseId.get(row.id) ?? [],
    }));

    return {
        purchases,
        pagination: { page, pageSize, totalItems, totalPages },
    };
}

/*
 * Protegido.
 *
 * Detalle de una compra con sus ítems.
 */
async function getPurchaseDetail(purchaseId) {
    const purchase = await repository.findPurchaseById(pool, purchaseId);

    if (!purchase) {
        throw new AppError(404, "No se encontró la compra");
    }

    const itemsByPurchaseId = await repository.fetchPurchaseItemsByPurchaseIds(
        pool,
        [purchase.id],
    );

    return {
        ...purchase,
        totalAmount: Number(purchase.totalAmount),
        items: itemsByPurchaseId.get(purchase.id) ?? [],
    };
}

/*
 * Protegido.
 *
 * Cambia el estado de una compra (a cargo del admin desde la web).
 */
async function updateStatus({ purchaseId, status }) {
    const purchase = await repository.updatePurchaseStatus(pool, {
        purchaseId,
        status,
    });

    if (!purchase) {
        throw new AppError(404, "No se encontró la compra");
    }

    return { ...purchase, totalAmount: Number(purchase.totalAmount) };
}

module.exports = {
    checkout,
    listPurchases,
    listMyPurchases,
    getPurchaseDetail,
    updateStatus,
};
