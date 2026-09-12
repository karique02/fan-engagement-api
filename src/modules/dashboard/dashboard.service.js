const pool = require("../../config/database");
const repository = require("./dashboard.repository");

/*
 * Protegido.
 *
 * Devuelve las métricas agregadas de fan engagement usadas por el
 * dashboard: KPIs generales, actividad reciente (30 días), rankings
 * top-5 de productos y promociones, salud del recomendador de
 * filtrado colaborativo y el embudo interacción -> carrito.
 */
async function getEngagement() {
    const [
        registeredFansResult,
        activeFansResult,
        productInteractionTotalsResult,
        promotionInteractionTotalsResult,
        activityResult,
        topProductsResult,
        topPromotionsResult,
        recommenderResult,
        funnelResult,
    ] = await repository.fetchEngagementRawData(pool);

    const registeredFans = Number(registeredFansResult.rows[0].count);
    const activeFans = Number(activeFansResult.rows[0].count);

    const productInteractions = Number(
        productInteractionTotalsResult.rows[0].total_interactions,
    );
    const promotionInteractions = Number(
        promotionInteractionTotalsResult.rows[0].total_interactions,
    );
    const totalInteractions = productInteractions + promotionInteractions;

    const activationRate = registeredFans > 0 ? activeFans / registeredFans : 0;
    const averageInteractionsPerActiveFan =
        activeFans > 0 ? totalInteractions / activeFans : 0;

    const activityDays = activityResult.rows.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        activeFans: Number(row.active_fans),
        interactions: Number(row.interactions),
    }));

    const topProducts = topProductsResult.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        categoryName: row.category_name,
        uniqueFans: Number(row.unique_fans),
        totalInteractions: Number(row.total_interactions),
        averageRating: Number(row.average_rating),
    }));

    const topPromotions = topPromotionsResult.rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        categoryName: row.category_name,
        uniqueFans: Number(row.unique_fans),
        totalInteractions: Number(row.total_interactions),
        averageRating: Number(row.average_rating),
    }));

    const recommenderRow = recommenderResult.rows[0];
    const fansWithProductRecommendations = Number(
        recommenderRow.fans_with_product_recommendations,
    );
    const coverageRate =
        activeFans > 0 ? fansWithProductRecommendations / activeFans : 0;
    const lastTrainedAt =
        [
            recommenderRow.product_last_trained_at,
            recommenderRow.promotion_last_trained_at,
        ]
            .filter((value) => value !== null)
            .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;

    const funnelRow = funnelResult.rows[0];
    const fansWithInteraction = Number(funnelRow.fans_with_interaction);
    const fansWithPurchase = Number(funnelRow.fans_with_purchase);
    const interactionToPurchaseRate =
        fansWithInteraction > 0 ? fansWithPurchase / fansWithInteraction : 0;

    return {
        generatedAt: new Date().toISOString(),
        kpis: {
            registeredFans,
            activeFans,
            activationRate,
            productInteractions,
            promotionInteractions,
            totalInteractions,
            averageInteractionsPerActiveFan,
            averageProductRating: Number(
                productInteractionTotalsResult.rows[0].average_rating,
            ),
            averagePromotionRating: Number(
                promotionInteractionTotalsResult.rows[0].average_rating,
            ),
        },
        activity: {
            days: activityDays,
        },
        topProducts,
        topPromotions,
        recommender: {
            fansWithProductRecommendations,
            fansWithPromotionRecommendations: Number(
                recommenderRow.fans_with_promotion_recommendations,
            ),
            productRecommendationCount: Number(
                recommenderRow.product_recommendation_count,
            ),
            promotionRecommendationCount: Number(
                recommenderRow.promotion_recommendation_count,
            ),
            coverageRate,
            lastTrainedAt,
        },
        funnel: {
            fansWithInteraction,
            fansWithPurchase,
            purchases: Number(funnelRow.purchases),
            purchasedItems: Number(funnelRow.purchased_items),
            purchasedAmount: Number(funnelRow.purchased_amount),
            interactionToPurchaseRate,
        },
    };
}

module.exports = { getEngagement };
