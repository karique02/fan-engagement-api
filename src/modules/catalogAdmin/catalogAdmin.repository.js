// Categorías de producto

async function listProductCategories(pool) {
    const result = await pool.query(`
        SELECT id, name
        FROM public.product_category
        ORDER BY name;
    `);

    return result.rows;
}

async function createProductCategory(pool, { name }) {
    const result = await pool.query(
        `
            INSERT INTO public.product_category (name)
            VALUES ($1)
            RETURNING id, name;
        `,
        [name],
    );

    return result.rows[0];
}

async function updateProductCategory(pool, id, { name }) {
    const result = await pool.query(
        `
            UPDATE public.product_category
            SET name = $1
            WHERE id = $2
            RETURNING id, name;
        `,
        [name, id],
    );

    return result.rows[0];
}

async function countProductCategoryUsage(pool, id) {
    const result = await pool.query(
        `
            SELECT COUNT(*)::integer AS count
            FROM public.product
            WHERE product_category_id = $1;
        `,
        [id],
    );

    return result.rows[0].count;
}

async function deleteProductCategory(pool, id) {
    const result = await pool.query(
        `
            DELETE FROM public.product_category
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    return result.rows[0];
}

// Categorías de promoción

async function listPromotionCategories(pool) {
    const result = await pool.query(`
        SELECT id, name
        FROM public.promotion_category
        ORDER BY name;
    `);

    return result.rows;
}

async function createPromotionCategory(pool, { name }) {
    const result = await pool.query(
        `
            INSERT INTO public.promotion_category (name)
            VALUES ($1)
            RETURNING id, name;
        `,
        [name],
    );

    return result.rows[0];
}

async function updatePromotionCategory(pool, id, { name }) {
    const result = await pool.query(
        `
            UPDATE public.promotion_category
            SET name = $1
            WHERE id = $2
            RETURNING id, name;
        `,
        [name, id],
    );

    return result.rows[0];
}

async function countPromotionCategoryUsage(pool, id) {
    const result = await pool.query(
        `
            SELECT COUNT(*)::integer AS count
            FROM public.promotion
            WHERE promotion_category_id = $1;
        `,
        [id],
    );

    return result.rows[0].count;
}

async function deletePromotionCategory(pool, id) {
    const result = await pool.query(
        `
            DELETE FROM public.promotion_category
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    return result.rows[0];
}

// Productos

const PRODUCT_ADMIN_COLUMNS = `
    p.id,
    p.name,
    p.product_category_id AS "productCategoryId",
    pc.name AS "productCategoryName",
    p.price,
    p.image,
    p.description,
    p.active
`;

async function listProductsAdmin(pool, { search, pageSize, offset }) {
    const result = await pool.query(
        `
            SELECT
                ${PRODUCT_ADMIN_COLUMNS},
                COUNT(*) OVER() AS "totalItems"
            FROM public.product p
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            WHERE $1::text IS NULL OR p.name ILIKE $1
            ORDER BY p.id
            LIMIT $2 OFFSET $3;
        `,
        [search ?? null, pageSize, offset],
    );

    return result.rows;
}

async function createProduct(
    pool,
    { name, productCategoryId, price, image, description },
) {
    const result = await pool.query(
        `
            INSERT INTO public.product (
                name,
                product_category_id,
                price,
                image,
                description
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `,
        [name, productCategoryId, price, image ?? null, description ?? null],
    );

    return findProductById(pool, result.rows[0].id);
}

async function updateProduct(
    pool,
    id,
    { name, productCategoryId, price, image, description, active },
) {
    const result = await pool.query(
        `
            UPDATE public.product
            SET
                name = $1,
                product_category_id = $2,
                price = $3,
                image = $4,
                description = $5,
                active = $6
            WHERE id = $7
            RETURNING id;
        `,
        [
            name,
            productCategoryId,
            price,
            image ?? null,
            description ?? null,
            active,
            id,
        ],
    );

    if (result.rows.length === 0) {
        return undefined;
    }

    return findProductById(pool, id);
}

async function deactivateProduct(pool, id) {
    const result = await pool.query(
        `
            UPDATE public.product
            SET active = false
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    if (result.rows.length === 0) {
        return undefined;
    }

    return findProductById(pool, id);
}

async function findProductById(pool, id) {
    const result = await pool.query(
        `
            SELECT ${PRODUCT_ADMIN_COLUMNS}
            FROM public.product p
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            WHERE p.id = $1;
        `,
        [id],
    );

    return result.rows[0];
}

// Promociones

const PROMOTION_ADMIN_COLUMNS = `
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
`;

async function listPromotionsAdmin(pool, { search, pageSize, offset }) {
    const result = await pool.query(
        `
            SELECT
                ${PROMOTION_ADMIN_COLUMNS},
                COUNT(*) OVER() AS "totalItems"
            FROM public.promotion p
            INNER JOIN public.promotion_category pc
                ON pc.id = p.promotion_category_id
            WHERE $1::text IS NULL OR p.title ILIKE $1
            ORDER BY p.id
            LIMIT $2 OFFSET $3;
        `,
        [search ?? null, pageSize, offset],
    );

    return result.rows;
}

async function createPromotion(
    client,
    {
        title,
        buyQuantity,
        payQuantity,
        discountPercentage,
        promotionCategoryId,
        description,
        image,
        deadline,
    },
) {
    const result = await client.query(
        `
            INSERT INTO public.promotion (
                title,
                buy_quantity,
                pay_quantity,
                discount_percentage,
                promotion_category_id,
                description,
                image,
                deadline
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `,
        [
            title,
            buyQuantity ?? null,
            payQuantity ?? null,
            discountPercentage ?? null,
            promotionCategoryId,
            description,
            image,
            deadline,
        ],
    );

    return result.rows[0].id;
}

async function updatePromotion(
    client,
    id,
    {
        title,
        buyQuantity,
        payQuantity,
        discountPercentage,
        promotionCategoryId,
        description,
        image,
        deadline,
        active,
    },
) {
    const result = await client.query(
        `
            UPDATE public.promotion
            SET
                title = $1,
                buy_quantity = $2,
                pay_quantity = $3,
                discount_percentage = $4,
                promotion_category_id = $5,
                description = $6,
                image = $7,
                deadline = $8,
                active = $9
            WHERE id = $10
            RETURNING id;
        `,
        [
            title,
            buyQuantity ?? null,
            payQuantity ?? null,
            discountPercentage ?? null,
            promotionCategoryId,
            description,
            image,
            deadline,
            active,
            id,
        ],
    );

    return result.rows[0];
}

async function deactivatePromotion(pool, id) {
    const result = await pool.query(
        `
            UPDATE public.promotion
            SET active = false
            WHERE id = $1
            RETURNING id;
        `,
        [id],
    );

    if (result.rows.length === 0) {
        return undefined;
    }

    return findPromotionById(pool, id);
}

async function replacePromotionProducts(client, promotionId, productIds) {
    await client.query(
        `
            DELETE FROM public.promotion_product
            WHERE promotion_id = $1;
        `,
        [promotionId],
    );

    for (const productId of productIds) {
        await client.query(
            `
                INSERT INTO public.promotion_product (promotion_id, product_id)
                VALUES ($1, $2);
            `,
            [promotionId, productId],
        );
    }
}

async function findPromotionById(pool, id) {
    const result = await pool.query(
        `
            SELECT ${PROMOTION_ADMIN_COLUMNS}
            FROM public.promotion p
            INNER JOIN public.promotion_category pc
                ON pc.id = p.promotion_category_id
            WHERE p.id = $1;
        `,
        [id],
    );

    return result.rows[0];
}

async function findPromotionProductIds(pool, promotionId) {
    const result = await pool.query(
        `
            SELECT product_id AS "productId"
            FROM public.promotion_product
            WHERE promotion_id = $1
            ORDER BY product_id;
        `,
        [promotionId],
    );

    return result.rows.map((row) => row.productId);
}

async function findPromotionProductIdsByPromotionIds(pool, promotionIds) {
    if (promotionIds.length === 0) {
        return [];
    }

    const result = await pool.query(
        `
            SELECT promotion_id AS "promotionId", product_id AS "productId"
            FROM public.promotion_product
            WHERE promotion_id = ANY($1::bigint[])
            ORDER BY promotion_id, product_id;
        `,
        [promotionIds],
    );

    return result.rows;
}

// Ventajas de ser miembro

const MEMBER_PROMOTION_ADMIN_COLUMNS = `
    id,
    title,
    description,
    image,
    benefit,
    active,
    created_at AS "createdAt"
`;

async function listMemberPromotionsAdmin(pool, { search, pageSize, offset }) {
    const result = await pool.query(
        `
            SELECT
                ${MEMBER_PROMOTION_ADMIN_COLUMNS},
                COUNT(*) OVER() AS "totalItems"
            FROM public.member_promotion
            WHERE $1::text IS NULL OR title ILIKE $1
            ORDER BY id
            LIMIT $2 OFFSET $3;
        `,
        [search ?? null, pageSize, offset],
    );

    return result.rows;
}

async function createMemberPromotion(
    pool,
    { title, description, image, benefit },
) {
    const result = await pool.query(
        `
            INSERT INTO public.member_promotion (title, description, image, benefit)
            VALUES ($1, $2, $3, $4)
            RETURNING ${MEMBER_PROMOTION_ADMIN_COLUMNS};
        `,
        [title, description, image, benefit],
    );

    return result.rows[0];
}

async function updateMemberPromotion(
    pool,
    id,
    { title, description, image, benefit, active },
) {
    const result = await pool.query(
        `
            UPDATE public.member_promotion
            SET
                title = $1,
                description = $2,
                image = $3,
                benefit = $4,
                active = $5
            WHERE id = $6
            RETURNING ${MEMBER_PROMOTION_ADMIN_COLUMNS};
        `,
        [title, description, image, benefit, active, id],
    );

    return result.rows[0];
}

async function deactivateMemberPromotion(pool, id) {
    const result = await pool.query(
        `
            UPDATE public.member_promotion
            SET active = false
            WHERE id = $1
            RETURNING ${MEMBER_PROMOTION_ADMIN_COLUMNS};
        `,
        [id],
    );

    return result.rows[0];
}

module.exports = {
    listProductCategories,
    createProductCategory,
    updateProductCategory,
    countProductCategoryUsage,
    deleteProductCategory,
    listPromotionCategories,
    createPromotionCategory,
    updatePromotionCategory,
    countPromotionCategoryUsage,
    deletePromotionCategory,
    listProductsAdmin,
    createProduct,
    updateProduct,
    deactivateProduct,
    findProductById,
    listPromotionsAdmin,
    createPromotion,
    updatePromotion,
    deactivatePromotion,
    replacePromotionProducts,
    findPromotionById,
    findPromotionProductIds,
    findPromotionProductIdsByPromotionIds,
    listMemberPromotionsAdmin,
    createMemberPromotion,
    updateMemberPromotion,
    deactivateMemberPromotion,
};
