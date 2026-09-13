const pool = require("../../config/database");
const repository = require("./catalog.repository");
const {
    isFreeShippingPromotionVisible,
    hasUserPurchasedFreeShippingPromotion,
} = require("../../shared/promotions/freeShippingVisibility");

async function listProducts() {
    return repository.listProducts(pool);
}

async function listPromotions(userId) {
    const isFreeShippingVisible = (await isFreeShippingPromotionVisible(pool))
        && !(await hasUserPurchasedFreeShippingPromotion(pool, userId));

    return repository.listPromotions(pool, { isFreeShippingVisible });
}

module.exports = { listProducts, listPromotions };
