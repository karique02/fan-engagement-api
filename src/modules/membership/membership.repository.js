async function findLatestMembership(pool, userId) {
    const result = await pool.query(
        `
            SELECT
                id,
                source,
                started_at AS "startedAt",
                ends_at AS "endsAt"
            FROM public.user_membership
            WHERE user_id = $1
            ORDER BY ends_at DESC
            LIMIT 1;
        `,
        [userId],
    );

    return result.rows[0];
}

async function findTrialMembership(client, userId) {
    const result = await client.query(
        `
            SELECT id
            FROM public.user_membership
            WHERE user_id = $1
              AND source = 'trial'
            LIMIT 1;
        `,
        [userId],
    );

    return result.rows[0];
}

async function insertTrialMembership(client, userId) {
    const result = await client.query(
        `
            INSERT INTO public.user_membership (
                user_id,
                source,
                started_at,
                ends_at
            )
            VALUES (
                $1,
                'trial',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP + INTERVAL '1 month'
            )
            RETURNING
                id,
                source,
                started_at AS "startedAt",
                ends_at AS "endsAt";
        `,
        [userId],
    );

    return result.rows[0];
}

async function hasEverUsedTrial(pool, userId) {
    const result = await pool.query(
        `
            SELECT 1
            FROM public.user_membership
            WHERE user_id = $1
              AND source = 'trial'
            LIMIT 1;
        `,
        [userId],
    );

    return result.rowCount > 0;
}

async function listActiveMemberPromotions(pool) {
    const result = await pool.query(
        `
            SELECT
                id,
                title,
                description,
                image,
                benefit
            FROM public.member_promotion
            WHERE active = true
            ORDER BY id;
        `,
    );

    return result.rows;
}

module.exports = {
    findLatestMembership,
    findTrialMembership,
    insertTrialMembership,
    hasEverUsedTrial,
    listActiveMemberPromotions,
};
