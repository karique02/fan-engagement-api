async function findRecipientsForAll(pool) {
    const result = await pool.query(`
        SELECT id, username, fcm_token AS "fcmToken"
        FROM public."user"
        WHERE fcm_token IS NOT NULL;
    `);

    return result.rows;
}

async function findRecipientsByIds(pool, userIds) {
    const result = await pool.query(
        `
        SELECT id, username, fcm_token AS "fcmToken"
        FROM public."user"
        WHERE id = ANY($1);
        `,
        [userIds],
    );

    return result.rows;
}

async function clearFcmTokens(pool, userIds) {
    await pool.query(
        `UPDATE public."user" SET fcm_token = NULL WHERE id = ANY($1);`,
        [userIds],
    );
}

async function insertNotificationLog(pool, {
    title,
    body,
    imageUrl,
    target,
    sentByUserId,
    deliveredCount,
    failedCount,
    noTokenCount,
}) {
    const result = await pool.query(
        `
        INSERT INTO public.notification_log
            (title, body, image_url, target_type, sent_by_user_id, delivered_count, failed_count, no_token_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
        `,
        [title, body, imageUrl, target, sentByUserId, deliveredCount, failedCount, noTokenCount],
    );

    return result.rows[0].id;
}

async function insertNotificationLogRecipients(pool, notificationLogId, recipients) {
    if (recipients.length === 0) {
        return;
    }

    const values = [];
    const params = [];
    recipients.forEach((recipient, index) => {
        const base = index * 3;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(notificationLogId, recipient.userId, recipient.status);
    });

    await pool.query(
        `
        INSERT INTO public.notification_log_recipient
            (notification_log_id, user_id, status)
        VALUES ${values.join(", ")};
        `,
        params,
    );
}

async function listNotificationLogs(pool, { whereClause, params, limitParamIndex, offsetParamIndex }) {
    const result = await pool.query(
        `
        SELECT
            nl.id,
            nl.title,
            nl.body,
            nl.image_url AS "imageUrl",
            nl.target_type AS "targetType",
            nl.delivered_count AS "deliveredCount",
            nl.failed_count AS "failedCount",
            nl.no_token_count AS "noTokenCount",
            sender.username AS "sentByUsername",
            nl.created_at AS "createdAt",
            COUNT(*) OVER() AS "totalItems"
        FROM public.notification_log nl
        LEFT JOIN public."user" sender
            ON sender.id = nl.sent_by_user_id
        ${whereClause}
        ORDER BY nl.created_at DESC
        LIMIT $${limitParamIndex}
        OFFSET $${offsetParamIndex};
        `,
        params,
    );

    return result.rows;
}

async function listRecipientsByLogIds(pool, logIds) {
    if (logIds.length === 0) {
        return [];
    }

    const result = await pool.query(
        `
        SELECT
            nlr.notification_log_id AS "logId",
            u.id AS "userId",
            u.username,
            nlr.status
        FROM public.notification_log_recipient nlr
        INNER JOIN public."user" u ON u.id = nlr.user_id
        WHERE nlr.notification_log_id = ANY($1)
        ORDER BY u.username;
        `,
        [logIds],
    );

    return result.rows;
}

async function deleteNotificationLog(pool, id) {
    const result = await pool.query(
        `DELETE FROM public.notification_log WHERE id = $1 RETURNING id;`,
        [id],
    );

    return result.rowCount > 0;
}

module.exports = {
    findRecipientsForAll,
    findRecipientsByIds,
    clearFcmTokens,
    insertNotificationLog,
    insertNotificationLogRecipients,
    listNotificationLogs,
    listRecipientsByLogIds,
    deleteNotificationLog,
};
