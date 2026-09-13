const pool = require("../../config/database");
const { trainCollaborativeFiltering } = require("../../jobs/collaborativeFiltering.job");
const repository = require("./recommendations.repository");
const {
    isFreeShippingPromotionVisible,
    hasUserPurchasedFreeShippingPromotion,
} = require("../../shared/promotions/freeShippingVisibility");

async function train() {
    return trainCollaborativeFiltering();
}

async function listProductRecommendations(userId) {
    return repository.listProductRecommendations(pool, userId);
}

async function listPromotionRecommendations(userId) {
    const isFreeShippingVisible = (await isFreeShippingPromotionVisible(pool))
        && !(await hasUserPurchasedFreeShippingPromotion(pool, userId));

    return repository.listPromotionRecommendations(pool, userId, { isFreeShippingVisible });
}

module.exports = { train, listProductRecommendations, listPromotionRecommendations };
