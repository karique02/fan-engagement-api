const pool = require("../../config/database");
const repository = require("./images.repository");

async function listImages() {
    return repository.listImages(pool);
}

module.exports = { listImages };
