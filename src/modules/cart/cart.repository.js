async function findCartByUserId(pool, userId) {
    const result = await pool.query(
        `
            SELECT
                sc.id,
                sc.created_at AS "createdAt",
                sc.updated_at AS "updatedAt"
            FROM public.shopping_cart sc
            WHERE sc.user_id = $1
            LIMIT 1;
        `,
        [userId],
    );

    return result.rows[0];
}

async function listCartItems(pool, cartId) {
    const result = await pool.query(
        `
            SELECT
                sci.id AS "cartItemId",
                sci.quantity,
                sci.created_at AS "createdAt",
                sci.updated_at AS "updatedAt",

                CASE
                    WHEN sci.product_id IS NOT NULL THEN 'product'
                    WHEN sci.promotion_id IS NOT NULL THEN 'promotion'
                END AS "itemType",

                p.id AS "productId",
                p.name AS "productName",
                p.product_category_id AS "productCategoryId",
                pc.name AS "productCategoryName",
                p.price AS "productPrice",
                p.image AS "productImage",
                p.description AS "productDescription",

                pr.id AS "promotionId",
                pr.title AS "promotionTitle",
                pr.buy_quantity AS "buyQuantity",
                pr.pay_quantity AS "payQuantity",
                pr.discount_percentage AS "discountPercentage",
                pr.promotion_category_id AS "promotionCategoryId",
                prm.name AS "promotionCategoryName",
                pr.description AS "promotionDescription",
                pr.image AS "promotionImage",
                pr.deadline AS "promotionDeadline",

                CASE
                    WHEN pr.id IS NOT NULL
                        AND pr.deadline IS NOT NULL
                        AND pr.deadline < CURRENT_TIMESTAMP
                    THEN true
                    ELSE false
                END AS "isPromotionExpired"

            FROM public.shopping_cart_item sci

            LEFT JOIN public.product p
                ON p.id = sci.product_id

            LEFT JOIN public.product_category pc
                ON pc.id = p.product_category_id

            LEFT JOIN public.promotion pr
                ON pr.id = sci.promotion_id

            LEFT JOIN public.promotion_category prm
                ON prm.id = pr.promotion_category_id

            WHERE sci.shopping_cart_id = $1
            ORDER BY sci.created_at DESC;
        `,
        [cartId],
    );

    return result.rows;
}

async function findProductById(client, productId) {
    const result = await client.query(
        `
            SELECT
                id,
                name,
                product_category_id AS "productCategoryId",
                price,
                image,
                description
            FROM public.product
            WHERE id = $1
            LIMIT 1;
        `,
        [productId],
    );

    return result.rows[0];
}

async function findPromotionById(client, promotionId) {
    const result = await client.query(
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
            WHERE p.id = $1
            LIMIT 1;
        `,
        [promotionId],
    );

    return result.rows[0];
}

async function upsertCartForUser(client, userId) {
    const result = await client.query(
        `
            INSERT INTO public.shopping_cart (
                user_id,
                created_at,
                updated_at
            )
            VALUES (
                $1,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
        `,
        [userId],
    );

    return result.rows[0];
}

async function upsertProductCartItem(client, { cartId, productId, quantity }) {
    const result = await client.query(
        `
            INSERT INTO public.shopping_cart_item AS sci (
                shopping_cart_id,
                product_id,
                quantity,
                created_at,
                updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (shopping_cart_id, product_id)
            WHERE product_id IS NOT NULL
            DO UPDATE SET
                quantity = sci.quantity + EXCLUDED.quantity,
                updated_at = CURRENT_TIMESTAMP
            RETURNING
                id AS "cartItemId",
                shopping_cart_id AS "shoppingCartId",
                product_id AS "productId",
                quantity,
                created_at AS "createdAt",
                updated_at AS "updatedAt";
        `,
        [cartId, productId, quantity],
    );

    return result.rows[0];
}

async function upsertPromotionCartItem(client, { cartId, promotionId, quantity }) {
    const result = await client.query(
        `
            INSERT INTO public.shopping_cart_item AS sci (
                shopping_cart_id,
                promotion_id,
                quantity,
                created_at,
                updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (shopping_cart_id, promotion_id)
            WHERE promotion_id IS NOT NULL
            DO UPDATE SET
                quantity = sci.quantity + EXCLUDED.quantity,
                updated_at = CURRENT_TIMESTAMP
            RETURNING
                id AS "cartItemId",
                shopping_cart_id AS "shoppingCartId",
                promotion_id AS "promotionId",
                quantity,
                created_at AS "createdAt",
                updated_at AS "updatedAt";
        `,
        [cartId, promotionId, quantity],
    );

    return result.rows[0];
}

async function updateCartItemQuantity(pool, { quantity, cartItemId, userId }) {
    const result = await pool.query(
        `
            UPDATE public.shopping_cart_item AS sci
            SET
                quantity = $1,
                updated_at = CURRENT_TIMESTAMP
            FROM public.shopping_cart AS sc
            WHERE sci.id = $2
              AND sci.shopping_cart_id = sc.id
              AND sc.user_id = $3
            RETURNING
                sci.id AS "cartItemId",
                sci.shopping_cart_id AS "shoppingCartId",
                sci.product_id AS "productId",
                sci.promotion_id AS "promotionId",
                sci.quantity,
                sci.created_at AS "createdAt",
                sci.updated_at AS "updatedAt";
        `,
        [quantity, cartItemId, userId],
    );

    return result.rows[0];
}

async function deleteCartItem(pool, { cartItemId, userId }) {
    const result = await pool.query(
        `
            DELETE FROM public.shopping_cart_item AS sci
            USING public.shopping_cart AS sc
            WHERE sci.id = $1
              AND sci.shopping_cart_id = sc.id
              AND sc.user_id = $2
            RETURNING
                sci.id AS "cartItemId",
                sci.shopping_cart_id AS "shoppingCartId",
                sci.product_id AS "productId",
                sci.promotion_id AS "promotionId",
                sci.quantity,
                sci.created_at AS "createdAt",
                sci.updated_at AS "updatedAt";
        `,
        [cartItemId, userId],
    );

    return result.rows[0];
}

async function deleteAllCartItems(pool, userId) {
    const result = await pool.query(
        `
            DELETE FROM public.shopping_cart_item AS sci
            USING public.shopping_cart AS sc
            WHERE sci.shopping_cart_id = sc.id
              AND sc.user_id = $1
            RETURNING sci.id;
        `,
        [userId],
    );

    return result;
}

async function touchCartUpdatedAt(pool, userId) {
    await pool.query(
        `
            UPDATE public.shopping_cart
            SET updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1;
        `,
        [userId],
    );
}

module.exports = {
    findCartByUserId,
    listCartItems,
    findProductById,
    findPromotionById,
    upsertCartForUser,
    upsertProductCartItem,
    upsertPromotionCartItem,
    updateCartItemQuantity,
    deleteCartItem,
    deleteAllCartItems,
    touchCartUpdatedAt,
};
