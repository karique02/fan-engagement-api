async function listImages(pool) {
    const result = await pool.query(`
        SELECT
            id,
            url,
            source_type AS "sourceType",
            source_id AS "sourceId"
        FROM public.image
        ORDER BY id;
    `);

    return result.rows;
}

module.exports = { listImages };
