const pool = require("../../config/database");
const repository = require("./catalog.repository");
const { resolveImageUrl } = require("../../shared/images/presignedUrlCache");
const {
    isFreeShippingPromotionVisible,
    hasUserPurchasedFreeShippingPromotion,
} = require("../../shared/promotions/freeShippingVisibility");

async function listProducts() {
    const products = await repository.listProducts(pool);

    return Promise.all(
        products.map(async (product) => ({
            ...product,
            image: await resolveImageUrl(product.image),
        })),
    );
}

async function listPromotions(userId) {
    const isFreeShippingVisible = (await isFreeShippingPromotionVisible(pool))
        && !(await hasUserPurchasedFreeShippingPromotion(pool, userId));

    const promotions = await repository.listPromotions(pool, { isFreeShippingVisible });

    return Promise.all(
        promotions.map(async (promotion) => ({
            ...promotion,
            image: await resolveImageUrl(promotion.image),
        })),
    );
}

module.exports = { listProducts, listPromotions };
