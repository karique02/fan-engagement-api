const crypto = require("node:crypto");

function createEmailVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    return { rawToken, tokenHash };
}

async function createOrReplaceEmailVerification(client, userId) {
    const { rawToken, tokenHash } = createEmailVerificationToken();

    await client.query(
        `
            INSERT INTO public.email_verification (
                user_id,
                token_hash,
                expires_at,
                created_at,
                used_at
            )
            VALUES (
                $1,
                $2,
                NOW() + INTERVAL '24 hours',
                NOW(),
                NULL
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                token_hash = EXCLUDED.token_hash,
                expires_at = EXCLUDED.expires_at,
                created_at = NOW(),
                used_at = NULL;
        `,
        [userId, tokenHash],
    );

    return rawToken;
}

async function insertUser(client, {
    username,
    email,
    passwordHash,
    cellphone,
    fullName,
}) {
    const result = await client.query(
        `
            INSERT INTO public."user" (
                username,
                email,
                password_hash,
                cellphone,
                full_name,
                state,
                email_verified_at
            )
            VALUES ($1, $2, $3, $4, $5, 'created', NULL)
            RETURNING
                id,
                username,
                email,
                full_name,
                cellphone,
                state;
        `,
        [username, email, passwordHash, cellphone, fullName],
    );

    return result.rows[0];
}

async function findUserByIdentifier(pool, normalizedIdentifier) {
    const result = await pool.query(
        `
            SELECT
                id,
                username,
                email,
                full_name,
                cellphone,
                password_hash,
                state,
                user_type
            FROM public."user"
            WHERE LOWER(username) = $1
               OR LOWER(email) = $1
            LIMIT 1;
        `,
        [normalizedIdentifier],
    );

    return result.rows[0];
}

async function consumeVerificationToken(pool, tokenHash) {
    const result = await pool.query(
        `
            WITH valid_verification AS (
                SELECT
                    ev.user_id
                FROM public.email_verification ev
                INNER JOIN public."user" u
                    ON u.id = ev.user_id
                WHERE ev.token_hash = $1
                  AND ev.used_at IS NULL
                  AND ev.expires_at > NOW()
                  AND u.state = 'created'
                FOR UPDATE
            ),
            activated_user AS (
                UPDATE public."user" u
                SET
                    state = 'active',
                    email_verified_at = NOW()
                FROM valid_verification vv
                WHERE u.id = vv.user_id
                RETURNING u.id
            ),
            consumed_token AS (
                UPDATE public.email_verification ev
                SET used_at = NOW()
                FROM activated_user au
                WHERE ev.user_id = au.id
                RETURNING ev.user_id
            )
            SELECT user_id
            FROM consumed_token;
        `,
        [tokenHash],
    );

    return result.rowCount > 0;
}

async function findUserForResend(client, normalizedEmail) {
    const result = await client.query(
        `
            SELECT
                id,
                email,
                state
            FROM public."user"
            WHERE LOWER(email) = $1
            LIMIT 1;
        `,
        [normalizedEmail],
    );

    return result.rows[0];
}

module.exports = {
    createOrReplaceEmailVerification,
    insertUser,
    findUserByIdentifier,
    consumeVerificationToken,
    findUserForResend,
};
