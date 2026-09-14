async function listImages(pool) {
    const result = await pool.query(`
        SELECT
            id,
            url,
            source_type AS "sourceType",
            source_id AS "sourceId",
            object_key AS "objectKey"
        FROM public.image
        ORDER BY id;
    `);

    return result.rows;
}

async function insertImage(pool, { url, sourceType, objectKey }) {
    const result = await pool.query(
        `
        INSERT INTO public.image (url, source_type, object_key)
        VALUES ($1, $2, $3)
        RETURNING id, url, source_type AS "sourceType", source_id AS "sourceId", object_key AS "objectKey";
        `,
        [url, sourceType, objectKey],
    );

    return result.rows[0];
}

async function findImageById(pool, id) {
    const result = await pool.query(
        `
        SELECT id, url, source_type AS "sourceType", source_id AS "sourceId", object_key AS "objectKey"
        FROM public.image
        WHERE id = $1;
        `,
        [id],
    );

    return result.rows[0] ?? null;
}

async function deleteImageById(pool, id) {
    await pool.query(`DELETE FROM public.image WHERE id = $1;`, [id]);
}

async function findImageUsage(pool, value) {
    const [products, promotions, memberPromotions] = await Promise.all([
        pool.query(
            `SELECT id, name FROM public.product WHERE image = $1 ORDER BY id;`,
            [value],
        ),
        pool.query(
            `SELECT id, title FROM public.promotion WHERE image = $1 ORDER BY id;`,
            [value],
        ),
        pool.query(
            `SELECT id, title FROM public.member_promotion WHERE image = $1 ORDER BY id;`,
            [value],
        ),
    ]);

    return {
        products: products.rows,
        promotions: promotions.rows,
        memberPromotions: memberPromotions.rows,
    };
}

module.exports = {
    listImages,
    insertImage,
    findImageById,
    deleteImageById,
    findImageUsage,
};
