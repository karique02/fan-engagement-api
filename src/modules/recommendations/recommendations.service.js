const pool = require("../../config/database");
const { trainCollaborativeFiltering } = require("../../jobs/collaborativeFiltering.job");
const repository = require("./recommendations.repository");
const { resolveImageUrl } = require("../../shared/images/presignedUrlCache");
const {
    isFreeShippingPromotionVisible,
    hasUserPurchasedFreeShippingPromotion,
} = require("../../shared/promotions/freeShippingVisibility");

async function train() {
    return trainCollaborativeFiltering();
}

async function listProductRecommendations(userId) {
    const products = await repository.listProductRecommendations(pool, userId);

    return Promise.all(
        products.map(async (product) => ({
            ...product,
            image: await resolveImageUrl(product.image),
        })),
    );
}

async function listPromotionRecommendations(userId) {
    const isFreeShippingVisible = (await isFreeShippingPromotionVisible(pool))
        && !(await hasUserPurchasedFreeShippingPromotion(pool, userId));

    const promotions = await repository.listPromotionRecommendations(pool, userId, {
        isFreeShippingVisible,
    });

    return Promise.all(
        promotions.map(async (promotion) => ({
            ...promotion,
            image: await resolveImageUrl(promotion.image),
        })),
    );
}

module.exports = { train, listProductRecommendations, listPromotionRecommendations };
