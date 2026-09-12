const pool = require("../../config/database");
const { trainCollaborativeFiltering } = require("../../jobs/collaborativeFiltering.job");
const repository = require("./recommendations.repository");

async function train() {
    return trainCollaborativeFiltering();
}

async function listProductRecommendations(userId) {
    return repository.listProductRecommendations(pool, userId);
}

async function listPromotionRecommendations(userId) {
    return repository.listPromotionRecommendations(pool, userId);
}

module.exports = { train, listProductRecommendations, listPromotionRecommendations };
