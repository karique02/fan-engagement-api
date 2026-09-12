const {
    PROMOTION_UNIT_PRICE_SELECT,
    PROMOTION_UNIT_PRICE_JOIN,
} = require("../../shared/sql/promotionUnitPrice");

async function findCartByUserId(client, userId) {
    const result = await client.query(
        `
            SELECT id
            FROM public.shopping_cart
            WHERE user_id = $1
            LIMIT 1;
        `,
        [userId],
    );

    return result.rows[0];
}

async function findCartItemsForCheckout(client, cartId) {
    const result = await client.query(
        `
            SELECT
                sci.quantity,
                CASE
                    WHEN sci.product_id IS NOT NULL THEN 'product'
                    ELSE 'promotion'
                END AS "itemType",
                p.id AS "productId",
                p.name AS "productName",
                p.price AS "productPrice",
                pr.id AS "promotionId",
                pr.title AS "promotionTitle",
                (${PROMOTION_UNIT_PRICE_SELECT}) AS "promotionUnitPrice"
            FROM public.shopping_cart_item sci
            LEFT JOIN public.product p
                ON p.id = sci.product_id
            LEFT JOIN public.promotion pr
                ON pr.id = sci.promotion_id
            ${PROMOTION_UNIT_PRICE_JOIN}
            WHERE sci.shopping_cart_id = $1;
        `,
        [cartId],
    );

    return result.rows;
}

async function insertPurchase(client, { userId, totalAmount, itemCount }) {
    const result = await client.query(
        `
            INSERT INTO public.purchase (
                user_id,
                status,
                total_amount,
                item_count
            )
            VALUES ($1, 'pending', $2, $3)
            RETURNING
                id,
                user_id AS "userId",
                status,
                total_amount AS "totalAmount",
                item_count AS "itemCount",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                completed_at AS "completedAt",
                cancelled_at AS "cancelledAt";
        `,
        [userId, totalAmount, itemCount],
    );

    return result.rows[0];
}

async function insertPurchaseItem(client, item) {
    await client.query(
        `
            INSERT INTO public.purchase_item (
                purchase_id,
                product_id,
                promotion_id,
                item_name,
                quantity,
                unit_price,
                line_total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [
            item.purchaseId,
            item.productId,
            item.promotionId,
            item.itemName,
            item.quantity,
            item.unitPrice,
            item.lineTotal,
        ],
    );
}

async function deleteCartItemsByCartId(client, cartId) {
    await client.query(
        `
            DELETE FROM public.shopping_cart_item
            WHERE shopping_cart_id = $1;
        `,
        [cartId],
    );
}

async function touchCartUpdatedAtById(client, cartId) {
    await client.query(
        `
            UPDATE public.shopping_cart
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
        `,
        [cartId],
    );
}

/*
 * Arma los ítems de una o varias compras (purchase_item), con los datos
 * actuales del catálogo (para imagen/categoría) junto al snapshot guardado.
 * Devuelve un Map<purchaseId, item[]>.
 */
async function fetchPurchaseItemsByPurchaseIds(pool, purchaseIds) {
    const itemsByPurchaseId = new Map();
    if (purchaseIds.length === 0) {
        return itemsByPurchaseId;
    }

    const result = await pool.query(
        `
            SELECT
                pi.id,
                pi.purchase_id AS "purchaseId",
                CASE
                    WHEN pi.product_id IS NOT NULL THEN 'product'
                    ELSE 'promotion'
                END AS "itemType",
                pi.item_name AS "itemName",
                pi.quantity,
                pi.unit_price AS "unitPrice",
                pi.line_total AS "lineTotal",
                p.id AS "productId",
                p.name AS "productName",
                p.image AS "productImage",
                pc.name AS "productCategoryName",
                pr.id AS "promotionId",
                pr.title AS "promotionTitle",
                pr.image AS "promotionImage",
                prc.name AS "promotionCategoryName"
            FROM public.purchase_item pi
            LEFT JOIN public.product p
                ON p.id = pi.product_id
            LEFT JOIN public.product_category pc
                ON pc.id = p.product_category_id
            LEFT JOIN public.promotion pr
                ON pr.id = pi.promotion_id
            LEFT JOIN public.promotion_category prc
                ON prc.id = pr.promotion_category_id
            WHERE pi.purchase_id = ANY($1::bigint[])
            ORDER BY pi.id ASC;
        `,
        [purchaseIds],
    );

    for (const row of result.rows) {
        const item = {
            id: row.id,
            type: row.itemType,
            quantity: row.quantity,
            itemName: row.itemName,
            unitPrice: Number(row.unitPrice),
            lineTotal: Number(row.lineTotal),
            product:
                row.itemType === "product"
                    ? {
                          id: row.productId,
                          name: row.productName,
                          image: row.productImage,
                          categoryName: row.productCategoryName,
                      }
                    : null,
            promotion:
                row.itemType === "promotion"
                    ? {
                          id: row.promotionId,
                          name: row.promotionTitle,
                          image: row.promotionImage,
                          categoryName: row.promotionCategoryName,
                      }
                    : null,
        };

        const list = itemsByPurchaseId.get(row.purchaseId) ?? [];
        list.push(item);
        itemsByPurchaseId.set(row.purchaseId, list);
    }

    return itemsByPurchaseId;
}

async function listPurchases(pool, { whereClause, params, limitParamIndex, offsetParamIndex }) {
    const result = await pool.query(
        `
            SELECT
                p.id,
                p.user_id AS "userId",
                u.username,
                p.status,
                p.total_amount AS "totalAmount",
                p.item_count AS "itemCount",
                p.created_at AS "createdAt",
                p.completed_at AS "completedAt",
                p.cancelled_at AS "cancelledAt",
                COUNT(*) OVER() AS "totalItems"
            FROM public.purchase p
            INNER JOIN public."user" u
                ON u.id = p.user_id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT $${limitParamIndex}
            OFFSET $${offsetParamIndex};
        `,
        params,
    );

    return result.rows;
}

async function listPurchasesByUserId(pool, { userId, pageSize, offset }) {
    const result = await pool.query(
        `
            SELECT
                p.id,
                p.user_id AS "userId",
                p.status,
                p.total_amount AS "totalAmount",
                p.item_count AS "itemCount",
                p.created_at AS "createdAt",
                p.completed_at AS "completedAt",
                p.cancelled_at AS "cancelledAt",
                COUNT(*) OVER() AS "totalItems"
            FROM public.purchase p
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT $2
            OFFSET $3;
        `,
        [userId, pageSize, offset],
    );

    return result.rows;
}

async function findPurchaseById(pool, purchaseId) {
    const result = await pool.query(
        `
            SELECT
                p.id,
                p.user_id AS "userId",
                u.username,
                p.status,
                p.total_amount AS "totalAmount",
                p.item_count AS "itemCount",
                p.created_at AS "createdAt",
                p.completed_at AS "completedAt",
                p.cancelled_at AS "cancelledAt"
            FROM public.purchase p
            INNER JOIN public."user" u
                ON u.id = p.user_id
            WHERE p.id = $1
            LIMIT 1;
        `,
        [purchaseId],
    );

    return result.rows[0];
}

async function updatePurchaseStatus(pool, { purchaseId, status }) {
    const result = await pool.query(
        `
            WITH input AS (
                SELECT
                    $1::bigint AS id,
                    $2::character varying(20) AS status
            )
            UPDATE public.purchase p
            SET
                status = i.status,
                updated_at = CURRENT_TIMESTAMP,
                completed_at = CASE
                    WHEN i.status = 'completed' THEN CURRENT_TIMESTAMP
                    ELSE NULL
                END,
                cancelled_at = CASE
                    WHEN i.status = 'cancelled' THEN CURRENT_TIMESTAMP
                    ELSE NULL
                END
            FROM input i
            WHERE p.id = i.id
            RETURNING
                p.id,
                p.user_id AS "userId",
                p.status,
                p.total_amount AS "totalAmount",
                p.item_count AS "itemCount",
                p.created_at AS "createdAt",
                p.updated_at AS "updatedAt",
                p.completed_at AS "completedAt",
                p.cancelled_at AS "cancelledAt";
        `,
        [purchaseId, status],
    );

    return result.rows[0];
}

module.exports = {
    findCartByUserId,
    findCartItemsForCheckout,
    insertPurchase,
    insertPurchaseItem,
    deleteCartItemsByCartId,
    touchCartUpdatedAtById,
    fetchPurchaseItemsByPurchaseIds,
    listPurchases,
    listPurchasesByUserId,
    findPurchaseById,
    updatePurchaseStatus,
};
