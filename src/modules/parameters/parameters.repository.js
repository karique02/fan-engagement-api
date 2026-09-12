async function getIntegerParameter(pool, parameterKey, defaultValue) {
    const result = await pool.query(
        `
            SELECT value
            FROM public.parameters
            WHERE key = $1
            LIMIT 1;
        `,
        [parameterKey],
    );

    if (result.rowCount === 0) {
        return defaultValue;
    }

    const parsedValue = Number.parseInt(result.rows[0].value, 10);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
        return defaultValue;
    }

    return parsedValue;
}

async function upsertParameter(client, key, value) {
    await client.query(
        `
            INSERT INTO public.parameters (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP;
        `,
        [key, value],
    );
}

module.exports = { getIntegerParameter, upsertParameter };
