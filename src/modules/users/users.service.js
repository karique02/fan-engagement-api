const pool = require("../../config/database");
const repository = require("./users.repository");

function formatUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        cellphone: user.cellphone,
    };
}

async function updateFcmToken(userId, fcmToken) {
    const user = await repository.updateFcmToken(pool, userId, fcmToken);
    return user ? formatUser(user) : null;
}

async function clearFcmToken(userId) {
    const user = await repository.clearFcmToken(pool, userId);
    return user ? formatUser(user) : null;
}

async function listUsers() {
    return repository.listUsers(pool);
}

module.exports = { updateFcmToken, clearFcmToken, listUsers };
