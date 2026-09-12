const { getMessaging } = require("firebase-admin/messaging");
require("../../config/firebase");
const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const { runPersonalizedNotificationCycle } = require("../../jobs/personalizedNotifications.job");
const repository = require("./notifications.repository");

async function sendNotification({ title, body, imageUrl, target, userIds, sentByUserId }) {
    const normalizedImageUrl =
        typeof imageUrl === "string" && imageUrl.length > 0 ? imageUrl : null;

    let recipientsRows;
    if (target === "all") {
        recipientsRows = await repository.findRecipientsForAll(pool);
    } else {
        recipientsRows = await repository.findRecipientsByIds(pool, userIds);

        if (recipientsRows.length !== userIds.length) {
            throw new AppError(400, "Uno o más userIds no existen");
        }
    }

    const recipients = recipientsRows.map((recipient) => ({
        userId: recipient.id,
        username: recipient.username,
        fcmToken: recipient.fcmToken,
        status: recipient.fcmToken ? null : "no_token",
    }));

    const tokensToSend = recipients.filter((recipient) => recipient.fcmToken);

    const invalidTokenErrorCodes = new Set([
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
    ]);
    const tokensToClear = [];

    for (let i = 0; i < tokensToSend.length; i += 500) {
        const batch = tokensToSend.slice(i, i + 500);

        const response = await getMessaging().sendEachForMulticast({
            tokens: batch.map((recipient) => recipient.fcmToken),
            notification: {
                title,
                body,
                ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
            },
        });

        response.responses.forEach((sendResponse, index) => {
            const recipient = batch[index];
            if (sendResponse.success) {
                recipient.status = "delivered";
                return;
            }

            recipient.status = "failed";
            if (invalidTokenErrorCodes.has(sendResponse.error?.code)) {
                tokensToClear.push(recipient.userId);
            }
        });
    }

    if (tokensToClear.length > 0) {
        await repository.clearFcmTokens(pool, tokensToClear);
    }

    const deliveredCount = recipients.filter((r) => r.status === "delivered").length;
    const failedCount = recipients.filter((r) => r.status === "failed").length;
    const noTokenCount = recipients.filter((r) => r.status === "no_token").length;

    const notificationLogId = await repository.insertNotificationLog(pool, {
        title,
        body,
        imageUrl: normalizedImageUrl,
        target,
        sentByUserId,
        deliveredCount,
        failedCount,
        noTokenCount,
    });

    await repository.insertNotificationLogRecipients(
        pool,
        notificationLogId,
        recipients,
    );

    return {
        notificationLogId,
        delivered: deliveredCount,
        failed: failedCount,
        noToken: noTokenCount,
        recipients: recipients.map((recipient) => ({
            userId: recipient.userId,
            username: recipient.username,
            status: recipient.status,
        })),
    };
}

async function listNotificationLogs({ whereClause, params, limitParamIndex, offsetParamIndex, pageSize, page }) {
    const rows = await repository.listNotificationLogs(pool, {
        whereClause,
        params,
        limitParamIndex,
        offsetParamIndex,
    });

    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const logs = rows.map(({ totalItems: _totalItems, ...row }) => row);

    const logIds = logs.map((log) => log.id);
    const recipientRows = await repository.listRecipientsByLogIds(pool, logIds);

    const recipientsByLogId = recipientRows.reduce((map, row) => {
        const list = map.get(row.logId) ?? [];
        list.push({ userId: row.userId, username: row.username, status: row.status });
        map.set(row.logId, list);
        return map;
    }, new Map());

    return {
        logs: logs.map((log) => ({
            ...log,
            recipients: recipientsByLogId.get(log.id) ?? [],
        })),
        pagination: { page, pageSize, totalItems, totalPages },
    };
}

async function deleteNotificationLog(id) {
    const deleted = await repository.deleteNotificationLog(pool, id);

    if (!deleted) {
        throw new AppError(404, "No se encontró el registro de notificación");
    }
}

async function runPersonalizedRun() {
    return runPersonalizedNotificationCycle({ ignoreSchedule: true });
}

module.exports = {
    sendNotification,
    listNotificationLogs,
    deleteNotificationLog,
    runPersonalizedRun,
};
