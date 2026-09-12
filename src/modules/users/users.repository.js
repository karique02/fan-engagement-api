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

module.exports = { updateFcmToken, clearFcmToken, listUsers };
