const { getMessaging } = require("firebase-admin/messaging");
require("../config/firebase");
const pool = require("../config/database");
const { getIntegerParameter } = require("../modules/parameters/parameters.repository");

let isPersonalizedNotificationCycleRunning = false;
async function runPersonalizedNotificationCycle({ ignoreSchedule } = {}) {
    if (isPersonalizedNotificationCycleRunning) {
        console.log("Personalized notification cycle skipped because another cycle is already running");
        return {
            skipped: true,
            reason: "Cycle already running",
        };
    }

    isPersonalizedNotificationCycleRunning = true;

    try {
        if (ignoreSchedule !== true) {
            const enabled = await getIntegerParameter(
                pool,
                "personalized_notification_enabled",
                1,
            );

            if (enabled === 0) {
                console.log("Personalized notification cycle skipped: disabled");
                return {
                    skipped: true,
                    reason: "Personalized notifications are disabled",
                };
            }

            const startHour = await getIntegerParameter(
                pool,
                "personalized_notification_start_hour",
                9,
            );
            const endHour = await getIntegerParameter(
                pool,
                "personalized_notification_end_hour",
                21,
            );

            const currentHour = Number.parseInt(
                new Intl.DateTimeFormat("es-PE", {
                    timeZone: "America/Lima",
                    hour: "numeric",
                    hour12: false,
                }).format(new Date()),
                10,
            );

            if (currentHour < startHour || currentHour >= endHour) {
                console.log(`Personalized notification cycle skipped: outside schedule (hour ${currentHour}, window [${startHour}, ${endHour}))`);
                return {
                    skipped: true,
                    reason: "Outside the configured schedule",
                };
            }
        }

        const repeatDays = await getIntegerParameter(
            pool,
            "personalized_notification_repeat_days",
            7,
        );

        const candidatesResult = await pool.query(
            `
                WITH candidate AS (
                    SELECT
                        u.id            AS user_id,
                        u.username,
                        u.fcm_token,
                        p.id            AS product_id,
                        p.name          AS product_name,
                        p.image         AS product_image,
                        upr.recommendation_score,
                        ROW_NUMBER() OVER (
                            PARTITION BY u.id
                            ORDER BY upr.recommendation_score DESC, p.id ASC
                        ) AS ranking
                    FROM public."user" u
                    INNER JOIN public.user_product_recommendation upr ON upr.user_id = u.id
                    INNER JOIN public.product p ON p.id = upr.product_id
                    WHERE u.fcm_token IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM public.notification_log nl
                          INNER JOIN public.notification_log_recipient nlr
                              ON nlr.notification_log_id = nl.id
                          WHERE nl.target_type = 'personalized'
                            AND nl.product_id = upr.product_id
                            AND nlr.user_id = u.id
                            AND nl.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
                      )
                )
                SELECT user_id::integer, username, fcm_token, product_id::integer, product_name, product_image
                FROM candidate
                WHERE ranking = 1;
            `,
            [repeatDays],
        );

        const candidates = candidatesResult.rows;

        const invalidTokenErrorCodes = new Set([
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
        ]);

        const results = candidates.map((candidate) => ({
            userId: candidate.user_id,
            username: candidate.username,
            productId: candidate.product_id,
            productName: candidate.product_name,
            productImage: candidate.product_image,
            fcmToken: candidate.fcm_token,
            status: "pending",
        }));

        const tokensToClear = [];

        for (let i = 0; i < results.length; i += 500) {
            const batch = results.slice(i, i + 500);

            const response = await getMessaging().sendEach(
                batch.map((candidate) => ({
                    token: candidate.fcmToken,
                    notification: {
                        title: "Te puede interesar",
                        body: `${candidate.productName} podría gustarte. ¡Míralo en la app!`,
                        ...(candidate.productImage
                            ? { imageUrl: candidate.productImage }
                            : {}),
                    },
                })),
            );

            response.responses.forEach((sendResponse, index) => {
                const candidate = batch[index];
                if (sendResponse.success) {
                    candidate.status = "delivered";
                    return;
                }

                candidate.status = "failed";
                if (invalidTokenErrorCodes.has(sendResponse.error?.code)) {
                    tokensToClear.push(candidate.userId);
                }
            });
        }

        if (tokensToClear.length > 0) {
            await pool.query(
                `UPDATE public."user" SET fcm_token = NULL WHERE id = ANY($1);`,
                [tokensToClear],
            );
        }

        const notifiedResults = results.filter(
            (candidate) => candidate.status === "delivered" || candidate.status === "failed",
        );

        if (notifiedResults.length > 0) {
            const client = await pool.connect();

            try {
                await client.query("BEGIN");

                for (const candidate of notifiedResults) {
                    const deliveredCount = candidate.status === "delivered" ? 1 : 0;
                    const failedCount = candidate.status === "failed" ? 1 : 0;

                    const logResult = await client.query(
                        `
                            INSERT INTO public.notification_log
                                (title, body, image_url, target_type, sent_by_user_id, product_id, delivered_count, failed_count, no_token_count)
                            VALUES ($1, $2, $3, 'personalized', NULL, $4, $5, $6, 0)
                            RETURNING id;
                        `,
                        [
                            "Te puede interesar",
                            `${candidate.productName} podría gustarte. ¡Míralo en la app!`,
                            candidate.productImage,
                            candidate.productId,
                            deliveredCount,
                            failedCount,
                        ],
                    );
                    const notificationLogId = logResult.rows[0].id;

                    await client.query(
                        `
                            INSERT INTO public.notification_log_recipient
                                (notification_log_id, user_id, status)
                            VALUES ($1, $2, $3);
                        `,
                        [notificationLogId, candidate.userId, candidate.status],
                    );
                }

                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        }

        const summary = {
            skipped: false,
            evaluatedUsers: candidates.length,
            notified: notifiedResults.length,
            delivered: notifiedResults.filter((candidate) => candidate.status === "delivered").length,
            failed: notifiedResults.filter((candidate) => candidate.status === "failed").length,
            results: notifiedResults.map((candidate) => ({
                userId: candidate.userId,
                username: candidate.username,
                productId: candidate.productId,
                productName: candidate.productName,
                status: candidate.status,
            })),
        };

        console.log("Personalized notification cycle completed", summary);

        return summary;
    } catch (error) {
        console.error("Personalized notification cycle failed", error);
        throw error;
    } finally {
        isPersonalizedNotificationCycleRunning = false;
    }
}
function startPersonalizedNotificationScheduler() {
    const executeNotificationCycle = async () => {
        let intervalMinutes = 60;

        try {
            intervalMinutes = await getIntegerParameter(
                pool,
                "personalized_notification_interval_minutes",
                60,
            );

            console.log(`Starting personalized notification cycle. Next interval: ${intervalMinutes} minutes`);

            await runPersonalizedNotificationCycle({ ignoreSchedule: false });
        } catch (error) {
            console.error("Scheduled personalized notification cycle failed", error);
        } finally {
            const nextExecutionDelayMilliseconds = intervalMinutes * 60 * 1000;

            setTimeout(
                executeNotificationCycle,
                nextExecutionDelayMilliseconds,
            );
        }
    };

    setTimeout(executeNotificationCycle, 20_000);
}

module.exports = {
    runPersonalizedNotificationCycle,
    startPersonalizedNotificationScheduler,
};
