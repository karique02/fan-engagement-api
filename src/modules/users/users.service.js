const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_PAGE_SIZES,
} = require("../../shared/validation/patterns");
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

/*
 * Protegido.
 *
 * Lista paginada/filtrable de usuarios tipo fan (user_type = 1), para el
 * buscador de fans del dashboard.
 */
async function listFans(query) {
    let search;
    if (query.search !== undefined && query.search !== "") {
        search = String(query.search);
        if (!INTERACTION_TEXT_FILTER_REGEX.test(search)) {
            throw new AppError(
                400,
                "El parámetro 'search' contiene caracteres no permitidos",
            );
        }
    }

    let page = Number.parseInt(query.page, 10);
    if (!Number.isInteger(page) || page < 1) {
        page = 1;
    }

    let pageSize = Number.parseInt(query.pageSize, 10);
    if (!INTERACTION_PAGE_SIZES.includes(pageSize)) {
        pageSize = 15;
    }

    const rows = await repository.listFans(pool, {
        search: search ? `%${search}%` : null,
        pageSize,
        offset: (page - 1) * pageSize,
    });

    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const fans = rows.map(({ totalItems: _totalItems, ...row }) => row);

    return {
        fans,
        pagination: { page, pageSize, totalItems, totalPages },
    };
}

module.exports = { updateFcmToken, clearFcmToken, listUsers, listFans };
