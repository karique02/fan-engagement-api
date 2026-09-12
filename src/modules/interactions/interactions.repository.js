async function upsertProductInteraction(pool, { userId, productId, rating }) {
    const result = await pool.query(
        `
            INSERT INTO public.user_product_interaction AS upi (
                user_id,
                product_id,
                rating,
                interaction_count,
                last_interaction_at
            )
            VALUES (
                $1,
                $2,
                $3,
                1,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id, product_id)
            DO UPDATE SET
                rating = ROUND(
                    (
                        (upi.rating * upi.interaction_count)
                        + EXCLUDED.rating
                    )
                    / (upi.interaction_count + 1),
                    2
                ),
                interaction_count = upi.interaction_count + 1,
                last_interaction_at = CURRENT_TIMESTAMP
            RETURNING
                user_id AS "userId",
                product_id AS "productId",
                rating,
                interaction_count AS "interactionCount",
                last_interaction_at AS "lastInteractionAt";
        `,
        [userId, productId, rating],
    );

    return result.rows[0];
}

async function upsertPromotionInteraction(pool, { userId, promotionId, rating }) {
    const result = await pool.query(
        `
            INSERT INTO public.user_promotion_interaction AS upi (
                user_id,
                promotion_id,
                rating,
                interaction_count,
                last_interaction_at
            )
            VALUES (
                $1,
                $2,
                $3,
                1,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id, promotion_id)
            DO UPDATE SET
                rating = ROUND(
                    (
                        (upi.rating * upi.interaction_count)
                        + EXCLUDED.rating
                    )
                    / (upi.interaction_count + 1),
                    2
                ),
                interaction_count = upi.interaction_count + 1,
                last_interaction_at = CURRENT_TIMESTAMP
            RETURNING
                user_id AS "userId",
                promotion_id AS "promotionId",
                rating,
                interaction_count AS "interactionCount",
                last_interaction_at AS "lastInteractionAt";
        `,
        [userId, promotionId, rating],
    );

    return result.rows[0];
}

async function listProductInteractions(pool, { whereClause, params, limitParamIndex, offsetParamIndex }) {
    const result = await pool.query(
        `
            SELECT
                upi.user_id AS "userId",
                u.username AS "username",
                upi.product_id AS "productId",
                p.name AS "productName",
                upi.rating,
                upi.interaction_count AS "interactionCount",
                upi.last_interaction_at AS "lastInteractionAt",
                COUNT(*) OVER() AS "totalItems"
            FROM public.user_product_interaction upi
            INNER JOIN public."user" u
                ON u.id = upi.user_id
            INNER JOIN public.product p
                ON p.id = upi.product_id
            ${whereClause}
            ORDER BY
                upi.last_interaction_at DESC,
                upi.user_id ASC,
                upi.product_id ASC
            LIMIT $${limitParamIndex}
            OFFSET $${offsetParamIndex};
        `,
        params,
    );

    return result.rows;
}

async function listPromotionInteractions(pool, { whereClause, params, limitParamIndex, offsetParamIndex }) {
    const result = await pool.query(
        `
            SELECT
                upi.user_id AS "userId",
                u.username AS "username",
                upi.promotion_id AS "promotionId",
                p.title AS "promotionTitle",
                upi.rating,
                upi.interaction_count AS "interactionCount",
                upi.last_interaction_at AS "lastInteractionAt",
                COUNT(*) OVER() AS "totalItems"
            FROM public.user_promotion_interaction upi
            INNER JOIN public."user" u
                ON u.id = upi.user_id
            INNER JOIN public.promotion p
                ON p.id = upi.promotion_id
            ${whereClause}
            ORDER BY
                upi.last_interaction_at DESC,
                upi.user_id ASC,
                upi.promotion_id ASC
            LIMIT $${limitParamIndex}
            OFFSET $${offsetParamIndex};
        `,
        params,
    );

    return result.rows;
}

module.exports = {
    upsertProductInteraction,
    upsertPromotionInteraction,
    listProductInteractions,
    listPromotionInteractions,
};
