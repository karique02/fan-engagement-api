const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const repository = require("./parameters.repository");

async function getPersonalizedNotificationSettings() {
    const [
        enabled,
        intervalMinutes,
        repeatDays,
        startHour,
        endHour,
        purchaseSignalWeight,
    ] = await Promise.all([
        repository.getIntegerParameter(pool, "personalized_notification_enabled", 1),
        repository.getIntegerParameter(
            pool,
            "personalized_notification_interval_minutes",
            60,
        ),
        repository.getIntegerParameter(pool, "personalized_notification_repeat_days", 7),
        repository.getIntegerParameter(pool, "personalized_notification_start_hour", 9),
        repository.getIntegerParameter(pool, "personalized_notification_end_hour", 21),
        repository.getIntegerParameter(pool, "purchase_signal_weight", 2),
    ]);

    return {
        enabled: enabled === 1,
        intervalMinutes,
        repeatDays,
        startHour,
        endHour,
        purchaseSignalWeight,
    };
}

async function updatePersonalizedNotificationSettings({
    enabled,
    intervalMinutes,
    repeatDays,
    startHour,
    endHour,
    purchaseSignalWeight,
}) {
    if (typeof enabled !== "boolean") {
        throw new AppError(400, "El campo 'enabled' debe ser un booleano");
    }

    if (
        !Number.isInteger(intervalMinutes) ||
        intervalMinutes < 1 ||
        intervalMinutes > 1440
    ) {
        throw new AppError(
            400,
            "El campo 'intervalMinutes' debe ser un entero entre 1 y 1440",
        );
    }

    if (!Number.isInteger(repeatDays) || repeatDays < 0 || repeatDays > 365) {
        throw new AppError(
            400,
            "El campo 'repeatDays' debe ser un entero entre 0 y 365",
        );
    }

    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
        throw new AppError(
            400,
            "El campo 'startHour' debe ser un entero entre 0 y 23",
        );
    }

    if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
        throw new AppError(400, "El campo 'endHour' debe ser un entero entre 1 y 24");
    }

    if (startHour >= endHour) {
        throw new AppError(400, "El campo 'startHour' debe ser menor que 'endHour'");
    }

    if (
        !Number.isInteger(purchaseSignalWeight) ||
        purchaseSignalWeight < 0 ||
        purchaseSignalWeight > 10
    ) {
        throw new AppError(
            400,
            "El campo 'purchaseSignalWeight' debe ser un entero entre 0 y 10",
        );
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const entries = [
            ["personalized_notification_enabled", enabled ? "1" : "0"],
            ["personalized_notification_interval_minutes", String(intervalMinutes)],
            ["personalized_notification_repeat_days", String(repeatDays)],
            ["personalized_notification_start_hour", String(startHour)],
            ["personalized_notification_end_hour", String(endHour)],
            ["purchase_signal_weight", String(purchaseSignalWeight)],
        ];

        for (const [key, value] of entries) {
            await repository.upsertParameter(client, key, value);
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return {
        enabled,
        intervalMinutes,
        repeatDays,
        startHour,
        endHour,
        purchaseSignalWeight,
    };
}

async function getFreeMembershipSettings() {
    const noticeEnabled = await repository.getBooleanParameter(
        pool,
        "free_membership_notice_enabled",
        true,
    );

    return { noticeEnabled };
}

async function updateFreeMembershipSettings({ noticeEnabled }) {
    if (typeof noticeEnabled !== "boolean") {
        throw new AppError(400, "El campo 'noticeEnabled' debe ser un booleano");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await repository.upsertParameter(
            client,
            "free_membership_notice_enabled",
            noticeEnabled ? "1" : "0",
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return { noticeEnabled };
}

module.exports = {
    getPersonalizedNotificationSettings,
    updatePersonalizedNotificationSettings,
    getFreeMembershipSettings,
    updateFreeMembershipSettings,
};
