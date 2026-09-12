const pool = require("../config/database");
const { getIntegerParameter } = require("../modules/parameters/parameters.repository");

async function trainProductRecommendations(client) {
    await client.query(
        `
            DELETE FROM public.user_product_recommendation;
        `,
    );

    const purchaseSignalWeight = await getIntegerParameter(
        pool,
        "purchase_signal_weight",
        2,
    );

    await client.query(
        `
            WITH purchased_product AS (
                SELECT DISTINCT p.user_id, pi.product_id
                FROM public.purchase p
                INNER JOIN public.purchase_item pi ON pi.purchase_id = p.id
                WHERE p.status <> 'cancelled'
                  AND pi.product_id IS NOT NULL
            ),
            user_product_signal AS (
                SELECT
                    COALESCE(upi.user_id, pp.user_id)       AS user_id,
                    COALESCE(upi.product_id, pp.product_id) AS product_id,
                    COALESCE(upi.rating, 0)
                        + CASE WHEN pp.user_id IS NOT NULL THEN $1::numeric ELSE 0 END AS rating
                FROM public.user_product_interaction upi
                FULL OUTER JOIN purchased_product pp
                    ON pp.user_id = upi.user_id
                   AND pp.product_id = upi.product_id
            ),
            product_similarity AS (
                SELECT
                    upi_a.product_id AS source_product_id,
                    upi_b.product_id AS recommended_product_id,
                    (
                        SUM(upi_a.rating * upi_b.rating)
                        /
                        NULLIF(
                            SQRT(SUM(upi_a.rating * upi_a.rating))
                            *
                            SQRT(SUM(upi_b.rating * upi_b.rating)),
                            0
                        )
                    ) AS similarity_score
                FROM user_product_signal upi_a
                INNER JOIN user_product_signal upi_b
                    ON upi_a.user_id = upi_b.user_id
                   AND upi_a.product_id <> upi_b.product_id
                GROUP BY
                    upi_a.product_id,
                    upi_b.product_id
            ),
            user_candidate_recommendation AS (
                SELECT
                    upi.user_id,
                    ps.recommended_product_id AS product_id,
                    SUM(upi.rating * ps.similarity_score) AS recommendation_score
                FROM user_product_signal upi
                INNER JOIN product_similarity ps
                    ON ps.source_product_id = upi.product_id
                GROUP BY
                    upi.user_id,
                    ps.recommended_product_id
            ),
            ranked_recommendation AS (
                SELECT
                    user_id,
                    product_id,
                    recommendation_score,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY recommendation_score DESC
                    ) AS ranking
                FROM user_candidate_recommendation
            )
            INSERT INTO public.user_product_recommendation (
                user_id,
                product_id,
                recommendation_score,
                generated_at
            )
            SELECT
                user_id,
                product_id,
                ROUND(recommendation_score, 6),
                CURRENT_TIMESTAMP
            FROM ranked_recommendation
            WHERE ranking <= 30;
        `,
        [purchaseSignalWeight],
    );
}
async function trainPromotionRecommendations(client) {
    await client.query(
        `
            DELETE FROM public.user_promotion_recommendation;
        `,
    );

    const purchaseSignalWeight = await getIntegerParameter(
        pool,
        "purchase_signal_weight",
        2,
    );

    await client.query(
        `
            WITH purchased_promotion AS (
                SELECT DISTINCT p.user_id, pi.promotion_id
                FROM public.purchase p
                INNER JOIN public.purchase_item pi ON pi.purchase_id = p.id
                WHERE p.status <> 'cancelled'
                  AND pi.promotion_id IS NOT NULL
            ),
            user_promotion_signal AS (
                SELECT
                    COALESCE(upi.user_id, pp.user_id)         AS user_id,
                    COALESCE(upi.promotion_id, pp.promotion_id) AS promotion_id,
                    COALESCE(upi.rating, 0)
                        + CASE WHEN pp.user_id IS NOT NULL THEN $1::numeric ELSE 0 END AS rating
                FROM public.user_promotion_interaction upi
                FULL OUTER JOIN purchased_promotion pp
                    ON pp.user_id = upi.user_id
                   AND pp.promotion_id = upi.promotion_id
            ),
            promotion_similarity AS (
                SELECT
                    upi_a.promotion_id AS source_promotion_id,
                    upi_b.promotion_id AS recommended_promotion_id,
                    (
                        SUM(upi_a.rating * upi_b.rating)
                        /
                        NULLIF(
                            SQRT(SUM(upi_a.rating * upi_a.rating))
                            *
                            SQRT(SUM(upi_b.rating * upi_b.rating)),
                            0
                        )
                    ) AS similarity_score
                FROM user_promotion_signal upi_a
                INNER JOIN user_promotion_signal upi_b
                    ON upi_a.user_id = upi_b.user_id
                   AND upi_a.promotion_id <> upi_b.promotion_id
                GROUP BY
                    upi_a.promotion_id,
                    upi_b.promotion_id
            ),
            user_candidate_recommendation AS (
                SELECT
                    upi.user_id,
                    ps.recommended_promotion_id AS promotion_id,
                    SUM(upi.rating * ps.similarity_score) AS recommendation_score
                FROM user_promotion_signal upi
                INNER JOIN promotion_similarity ps
                    ON ps.source_promotion_id = upi.promotion_id
                GROUP BY
                    upi.user_id,
                    ps.recommended_promotion_id
            ),
            ranked_recommendation AS (
                SELECT
                    user_id,
                    promotion_id,
                    recommendation_score,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY recommendation_score DESC
                    ) AS ranking
                FROM user_candidate_recommendation
            )
            INSERT INTO public.user_promotion_recommendation (
                user_id,
                promotion_id,
                recommendation_score,
                generated_at
            )
            SELECT
                user_id,
                promotion_id,
                ROUND(recommendation_score, 6),
                CURRENT_TIMESTAMP
            FROM ranked_recommendation
            WHERE ranking <= 30;
        `,
        [purchaseSignalWeight],
    );
}

let isCollaborativeFilteringTrainingRunning = false;
async function trainCollaborativeFiltering() {
    if (isCollaborativeFilteringTrainingRunning) {
        console.log("Collaborative filtering training skipped because another training is already running");
        return {
            skipped: true,
            reason: "Training already running",
        };
    }

    isCollaborativeFilteringTrainingRunning = true;

    const client = await pool.connect();

    try {
        const startedAt = new Date();

        await client.query("BEGIN");

        await trainProductRecommendations(client);
        await trainPromotionRecommendations(client);

        await client.query("COMMIT");

        const finishedAt = new Date();

        console.log("Collaborative filtering training completed", {
            startedAt,
            finishedAt,
        });

        return {
            skipped: false,
            startedAt,
            finishedAt,
        };
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Collaborative filtering training failed", error);

        throw error;
    } finally {
        client.release();
        isCollaborativeFilteringTrainingRunning = false;
    }
}
function startCollaborativeFilteringTrainingScheduler() {
    const executeTrainingCycle = async () => {
        let intervalMinutes = 10;

        try {
            intervalMinutes = await getIntegerParameter(
                pool,
                "collaborative_filtering_training_interval_minutes",
                10,
            );

            console.log(`Starting collaborative filtering training. Next interval: ${intervalMinutes} minutes`);

            await trainCollaborativeFiltering();
        } catch (error) {
            console.error("Scheduled collaborative filtering training failed", error);
        } finally {
            const nextExecutionDelayMilliseconds = intervalMinutes * 60 * 1000;

            setTimeout(
                executeTrainingCycle,
                nextExecutionDelayMilliseconds,
            );
        }
    };

    setTimeout(executeTrainingCycle, 10_000);
}

module.exports = {
    trainCollaborativeFiltering,
    startCollaborativeFilteringTrainingScheduler,
};
