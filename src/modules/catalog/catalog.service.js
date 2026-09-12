const pool = require("../../config/database");
const repository = require("./catalog.repository");

async function listProducts() {
    return repository.listProducts(pool);
}

async function listPromotions() {
    return repository.listPromotions(pool);
}

module.exports = { listProducts, listPromotions };
