async function listProducts(pool) {
    const result = await pool.query(`
        SELECT
            p.id,
            p.name,
            p.product_category_id AS "productCategoryId",
            pc.name AS "productCategoryName",
            p.price,
            p.image,
            p.description
        FROM public.product p
        INNER JOIN public.product_category pc
            ON pc.id = p.product_category_id
        WHERE p.active = true
        ORDER BY p.id;
    `);

    return result.rows;
}

async function listPromotions(pool, { isFreeShippingVisible }) {
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
            p.deadline
        FROM public.promotion p
        INNER JOIN public.promotion_category pc
            ON pc.id = p.promotion_category_id
        WHERE p.active = true
          AND (p.promotion_category_id <> 3 OR $1 = true)
        ORDER BY p.id;
    `,
        [isFreeShippingVisible],
    );

    return result.rows;
}

module.exports = { listProducts, listPromotions };
