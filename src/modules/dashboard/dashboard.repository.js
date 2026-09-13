async function fetchEngagementRawData(pool) {
    return Promise.all([
        pool.query(`SELECT COUNT(*) AS count FROM public."user";`),
        pool.query(`
            SELECT COUNT(DISTINCT user_id) AS count
            FROM (
                SELECT user_id FROM public.user_product_interaction
                UNION
                SELECT user_id FROM public.user_promotion_interaction
            ) active_fan;
        `),
        pool.query(`
            SELECT
                COALESCE(SUM(interaction_count), 0) AS total_interactions,
                COALESCE(AVG(rating), 0) AS average_rating
            FROM public.user_product_interaction;
        `),
        pool.query(`
            SELECT
                COALESCE(SUM(interaction_count), 0) AS total_interactions,
                COALESCE(AVG(rating), 0) AS average_rating
            FROM public.user_promotion_interaction;
        `),
        pool.query(`
            WITH day_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '29 days',
                    CURRENT_DATE,
                    '1 day'
                )::date AS day
            ),
            daily_activity AS (
                SELECT
                    date_trunc('day', last_interaction_at)::date AS day,
                    user_id,
                    interaction_count
                FROM public.user_product_interaction
                UNION ALL
                SELECT
                    date_trunc('day', last_interaction_at)::date AS day,
                    user_id,
                    interaction_count
                FROM public.user_promotion_interaction
            )
            SELECT
                ds.day,
                COALESCE(COUNT(DISTINCT da.user_id), 0) AS active_fans,
                COALESCE(SUM(da.interaction_count), 0) AS interactions
            FROM day_series ds
            LEFT JOIN daily_activity da
                ON da.day = ds.day
            GROUP BY ds.day
            ORDER BY ds.day ASC;
        `),
        pool.query(`
            SELECT
                p.id,
                p.name,
                pc.name AS category_name,
                COUNT(DISTINCT upi.user_id) AS unique_fans,
                COALESCE(SUM(upi.interaction_count), 0) AS total_interactions,
                COALESCE(AVG(upi.rating), 0) AS average_rating
            FROM public.user_product_interaction upi
            INNER JOIN public.product p
                ON p.id = upi.product_id
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            GROUP BY p.id, p.name, pc.name
            ORDER BY total_interactions DESC, average_rating DESC
            LIMIT 5;
        `),
        pool.query(`
            SELECT
                pr.id,
                pr.title,
                prc.name AS category_name,
                COUNT(DISTINCT upi.user_id) AS unique_fans,
                COALESCE(SUM(upi.interaction_count), 0) AS total_interactions,
                COALESCE(AVG(upi.rating), 0) AS average_rating
            FROM public.user_promotion_interaction upi
            INNER JOIN public.promotion pr
                ON pr.id = upi.promotion_id
            INNER JOIN public.promotion_category prc
                ON prc.id = pr.promotion_category_id
            GROUP BY pr.id, pr.title, prc.name
            ORDER BY total_interactions DESC, average_rating DESC
            LIMIT 5;
        `),
        pool.query(`
            SELECT
                (SELECT COUNT(DISTINCT user_id) FROM public.user_product_recommendation) AS fans_with_product_recommendations,
                (SELECT COUNT(DISTINCT user_id) FROM public.user_promotion_recommendation) AS fans_with_promotion_recommendations,
                (SELECT COUNT(*) FROM public.user_product_recommendation) AS product_recommendation_count,
                (SELECT COUNT(*) FROM public.user_promotion_recommendation) AS promotion_recommendation_count,
                (SELECT MAX(generated_at) FROM public.user_product_recommendation) AS product_last_trained_at,
                (SELECT MAX(generated_at) FROM public.user_promotion_recommendation) AS promotion_last_trained_at;
        `),
        pool.query(`
            SELECT
                (
                    SELECT COUNT(DISTINCT user_id) FROM (
                        SELECT user_id FROM public.user_product_interaction
                        UNION
                        SELECT user_id FROM public.user_promotion_interaction
                    ) active_fan
                ) AS fans_with_interaction,
                (
                    SELECT COUNT(DISTINCT user_id)
                    FROM public.purchase
                    WHERE status <> 'cancelled'
                ) AS fans_with_purchase,
                (SELECT COUNT(*) FROM public.purchase WHERE status <> 'cancelled') AS purchases,
                COALESCE((
                    SELECT SUM(pi.quantity)
                    FROM public.purchase_item pi
                    INNER JOIN public.purchase p ON p.id = pi.purchase_id
                    WHERE p.status <> 'cancelled'
                ), 0) AS purchased_items,
                COALESCE((
                    SELECT SUM(total_amount) FROM public.purchase WHERE status <> 'cancelled'
                ), 0) AS purchased_amount;
        `),
    ]);
}

async function fetchFanById(pool, userId) {
    const result = await pool.query(
        `
            SELECT
                id::integer AS id,
                username,
                full_name AS "fullName"
            FROM public."user"
            WHERE id = $1
              AND user_type = 1;
        `,
        [userId],
    );

    return result.rows[0];
}

async function fetchUserEngagementRawData(pool, userId) {
    return Promise.all([
        pool.query(
            `
                SELECT
                    COALESCE(SUM(interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(rating), 0) AS average_rating
                FROM public.user_product_interaction
                WHERE user_id = $1;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    COALESCE(SUM(interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(rating), 0) AS average_rating
                FROM public.user_promotion_interaction
                WHERE user_id = $1;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    GREATEST(
                        COALESCE((SELECT MAX(last_interaction_at) FROM public.user_product_interaction WHERE user_id = $1), '-infinity'::timestamptz),
                        COALESCE((SELECT MAX(last_interaction_at) FROM public.user_promotion_interaction WHERE user_id = $1), '-infinity'::timestamptz)
                    ) AS last_activity_at;
            `,
            [userId],
        ),
        pool.query(
            `
                WITH day_series AS (
                    SELECT generate_series(
                        CURRENT_DATE - INTERVAL '29 days',
                        CURRENT_DATE,
                        '1 day'
                    )::date AS day
                ),
                daily_activity AS (
                    SELECT
                        date_trunc('day', last_interaction_at)::date AS day,
                        interaction_count
                    FROM public.user_product_interaction
                    WHERE user_id = $1
                    UNION ALL
                    SELECT
                        date_trunc('day', last_interaction_at)::date AS day,
                        interaction_count
                    FROM public.user_promotion_interaction
                    WHERE user_id = $1
                )
                SELECT
                    ds.day,
                    COALESCE(SUM(da.interaction_count), 0) AS interactions
                FROM day_series ds
                LEFT JOIN daily_activity da
                    ON da.day = ds.day
                GROUP BY ds.day
                ORDER BY ds.day ASC;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    (
                        SELECT COUNT(*) FROM public.user_product_interaction WHERE user_id = $1
                    ) + (
                        SELECT COUNT(*) FROM public.user_promotion_interaction WHERE user_id = $1
                    ) AS interaction_count,
                    (
                        SELECT COUNT(*) FROM public.purchase WHERE status <> 'cancelled' AND user_id = $1
                    ) AS purchase_count,
                    COALESCE((
                        SELECT SUM(pi.quantity)
                        FROM public.purchase_item pi
                        INNER JOIN public.purchase p ON p.id = pi.purchase_id
                        WHERE p.status <> 'cancelled' AND p.user_id = $1
                    ), 0) AS purchased_items,
                    COALESCE((
                        SELECT SUM(total_amount) FROM public.purchase WHERE status <> 'cancelled' AND user_id = $1
                    ), 0) AS purchased_amount;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    p.id,
                    p.name,
                    pc.name AS category_name,
                    upr.recommendation_score AS score
                FROM public.user_product_recommendation upr
                INNER JOIN public.product p
                    ON p.id = upr.product_id
                INNER JOIN public.product_category pc
                    ON pc.id = p.product_category_id
                WHERE upr.user_id = $1
                ORDER BY upr.recommendation_score DESC
                LIMIT 5;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    pr.id,
                    pr.title,
                    prc.name AS category_name,
                    upr.recommendation_score AS score
                FROM public.user_promotion_recommendation upr
                INNER JOIN public.promotion pr
                    ON pr.id = upr.promotion_id
                INNER JOIN public.promotion_category prc
                    ON prc.id = pr.promotion_category_id
                WHERE upr.user_id = $1
                ORDER BY upr.recommendation_score DESC
                LIMIT 5;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    p.id,
                    p.name,
                    pc.name AS category_name,
                    upi.interaction_count,
                    upi.rating
                FROM public.user_product_interaction upi
                INNER JOIN public.product p
                    ON p.id = upi.product_id
                INNER JOIN public.product_category pc
                    ON pc.id = p.product_category_id
                WHERE upi.user_id = $1
                ORDER BY upi.interaction_count DESC, upi.rating DESC
                LIMIT 5;
            `,
            [userId],
        ),
        pool.query(
            `
                SELECT
                    pr.id,
                    pr.title,
                    prc.name AS category_name,
                    upi.interaction_count,
                    upi.rating
                FROM public.user_promotion_interaction upi
                INNER JOIN public.promotion pr
                    ON pr.id = upi.promotion_id
                INNER JOIN public.promotion_category prc
                    ON prc.id = pr.promotion_category_id
                WHERE upi.user_id = $1
                ORDER BY upi.interaction_count DESC, upi.rating DESC
                LIMIT 5;
            `,
            [userId],
        ),
    ]);
}

module.exports = { fetchEngagementRawData, fetchFanById, fetchUserEngagementRawData };
