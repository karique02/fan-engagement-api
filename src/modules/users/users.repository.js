async function updateFcmToken(pool, userId, fcmToken) {
    const result = await pool.query(
        `
            UPDATE public."user"
            SET fcm_token = $1
            WHERE id = $2
            RETURNING
                id,
                username,
                email,
                full_name,
                cellphone;
        `,
        [fcmToken, userId],
    );

    return result.rows[0];
}

async function clearFcmToken(pool, userId) {
    const result = await pool.query(
        `
            UPDATE public."user"
            SET fcm_token = NULL
            WHERE id = $1
            RETURNING
                id,
                username,
                email,
                full_name,
                cellphone;
        `,
        [userId],
    );

    return result.rows[0];
}

async function listUsers(pool) {
    const result = await pool.query(`
        SELECT
            id::integer AS id,
            username,
            email,
            (fcm_token IS NOT NULL) AS "hasFcmToken"
        FROM public."user"
        ORDER BY username;
    `);

    return result.rows;
}

async function listFans(pool, { search, pageSize, offset }) {
    const result = await pool.query(
        `
            SELECT
                id::integer AS id,
                username,
                email,
                full_name AS "fullName",
                COUNT(*) OVER() AS "totalItems"
            FROM public."user"
            WHERE user_type = 1
              AND ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1)
            ORDER BY username ASC
            LIMIT $2 OFFSET $3;
        `,
        [search ?? null, pageSize, offset],
    );

    return result.rows;
}

module.exports = { updateFcmToken, clearFcmToken, listUsers, listFans };
