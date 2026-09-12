async function listProductRecommendations(pool, userId) {
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
                upr.recommendation_score AS "recommendationScore",
                upr.generated_at AS "generatedAt"
            FROM public.user_product_recommendation upr
            INNER JOIN public.product p
                ON p.id = upr.product_id
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            WHERE upr.user_id = $1
            ORDER BY
                upr.recommendation_score DESC,
                p.id ASC
            LIMIT 30;
        `,
        [userId],
    );

    return result.rows;
}

async function listPromotionRecommendations(pool, userId) {
    const result = await pool.query(
        `
            SELECT
                pr.id,
                pr.title,
                pr.buy_quantity AS "buyQuantity",
                pr.pay_quantity AS "payQuantity",
                pr.discount_percentage AS "discountPercentage",
                pr.promotion_category_id AS "promotionCategoryId",
                pc.name AS "promotionCategoryName",
                pr.description,
                pr.image,
                upr.recommendation_score AS "recommendationScore",
                upr.generated_at AS "generatedAt"
            FROM public.user_promotion_recommendation upr
            INNER JOIN public.promotion pr
                ON pr.id = upr.promotion_id
            INNER JOIN public.promotion_category pc
                ON pc.id = pr.promotion_category_id
            WHERE upr.user_id = $1
            ORDER BY
                upr.recommendation_score DESC,
                pr.id ASC
            LIMIT 30;
        `,
        [userId],
    );

    return result.rows;
}

module.exports = { listProductRecommendations, listPromotionRecommendations };
