const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_PAGE_SIZES,
} = require("../../shared/validation/patterns");
const repository = require("./catalogAdmin.repository");

function parseListQuery(query) {
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

    return {
        search: search ? `%${search}%` : null,
        page,
        pageSize,
        offset: (page - 1) * pageSize,
    };
}

function buildPagination(rows, { page, pageSize }) {
    const totalItems = rows.length > 0 ? Number(rows[0].totalItems) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const items = rows.map(({ totalItems: _totalItems, ...row }) => row);

    return { items, pagination: { page, pageSize, totalItems, totalPages } };
}

function requireNonEmptyString(value, field, maxLength) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AppError(400, `El campo '${field}' es obligatorio`);
    }
    if (value.trim().length > maxLength) {
        throw new AppError(
            400,
            `El campo '${field}' no puede superar los ${maxLength} caracteres`,
        );
    }
    return value.trim();
}

function requireOptionalString(value, field, maxLength) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (typeof value !== "string") {
        throw new AppError(400, `El campo '${field}' debe ser texto`);
    }
    if (value.length > maxLength) {
        throw new AppError(
            400,
            `El campo '${field}' no puede superar los ${maxLength} caracteres`,
        );
    }
    return value;
}

function requirePositiveInteger(value, field) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError(
            400,
            `El campo '${field}' debe ser un número entero positivo`,
        );
    }
    return parsed;
}

function requireBoolean(value, field) {
    if (typeof value !== "boolean") {
        throw new AppError(400, `El campo '${field}' debe ser verdadero o falso`);
    }
    return value;
}

// Categorías de producto

async function listProductCategories() {
    const productCategories = await repository.listProductCategories(pool);
    return { productCategories };
}

async function createProductCategory({ name }) {
    const validatedName = requireNonEmptyString(name, "name", 100);
    const productCategory = await repository.createProductCategory(pool, {
        name: validatedName,
    });
    return { productCategory };
}

async function updateProductCategory(id, { name }) {
    const categoryId = requirePositiveInteger(id, "id");
    const validatedName = requireNonEmptyString(name, "name", 100);

    const productCategory = await repository.updateProductCategory(
        pool,
        categoryId,
        { name: validatedName },
    );

    if (!productCategory) {
        throw new AppError(404, "La categoría de producto no fue encontrada");
    }

    return { productCategory };
}

async function deleteProductCategory(id) {
    const categoryId = requirePositiveInteger(id, "id");

    const usageCount = await repository.countProductCategoryUsage(
        pool,
        categoryId,
    );
    if (usageCount > 0) {
        throw new AppError(
            409,
            "No se puede eliminar la categoría porque tiene productos asociados",
        );
    }

    const deleted = await repository.deleteProductCategory(pool, categoryId);
    if (!deleted) {
        throw new AppError(404, "La categoría de producto no fue encontrada");
    }
}

// Categorías de promoción

async function listPromotionCategories() {
    const promotionCategories = await repository.listPromotionCategories(pool);
    return { promotionCategories };
}

async function createPromotionCategory({ name }) {
    const validatedName = requireNonEmptyString(name, "name", 100);
    const promotionCategory = await repository.createPromotionCategory(pool, {
        name: validatedName,
    });
    return { promotionCategory };
}

async function updatePromotionCategory(id, { name }) {
    const categoryId = requirePositiveInteger(id, "id");
    const validatedName = requireNonEmptyString(name, "name", 100);

    const promotionCategory = await repository.updatePromotionCategory(
        pool,
        categoryId,
        { name: validatedName },
    );

    if (!promotionCategory) {
        throw new AppError(404, "La categoría de promoción no fue encontrada");
    }

    return { promotionCategory };
}

async function deletePromotionCategory(id) {
    const categoryId = requirePositiveInteger(id, "id");

    const usageCount = await repository.countPromotionCategoryUsage(
        pool,
        categoryId,
    );
    if (usageCount > 0) {
        throw new AppError(
            409,
            "No se puede eliminar la categoría porque tiene promociones asociadas",
        );
    }

    const deleted = await repository.deletePromotionCategory(pool, categoryId);
    if (!deleted) {
        throw new AppError(404, "La categoría de promoción no fue encontrada");
    }
}

// Productos

function validateProductPayload(body) {
    const name = requireNonEmptyString(body.name, "name", 150);
    const productCategoryId = requirePositiveInteger(
        body.productCategoryId,
        "productCategoryId",
    );

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
        throw new AppError(
            400,
            "El campo 'price' debe ser un número mayor o igual a 0",
        );
    }

    const image = requireOptionalString(body.image, "image", 10000);
    const description = requireOptionalString(
        body.description,
        "description",
        10000,
    );

    return { name, productCategoryId, price, image, description };
}

async function runProductWrite(operation) {
    try {
        return await operation();
    } catch (error) {
        if (
            error.code === "23503" &&
            error.constraint === "fk_product_product_category"
        ) {
            throw new AppError(400, "La categoría de producto indicada no existe");
        }
        throw error;
    }
}

async function listProducts(query) {
    const { search, page, pageSize, offset } = parseListQuery(query);
    const rows = await repository.listProductsAdmin(pool, {
        search,
        pageSize,
        offset,
    });
    return buildPagination(rows, { page, pageSize });
}

async function createProduct(body) {
    const payload = validateProductPayload(body);
    const product = await runProductWrite(() =>
        repository.createProduct(pool, payload),
    );
    return { product };
}

async function updateProduct(id, body) {
    const productId = requirePositiveInteger(id, "id");
    const payload = validateProductPayload(body);
    const active = requireBoolean(body.active, "active");

    const product = await runProductWrite(() =>
        repository.updateProduct(pool, productId, { ...payload, active }),
    );

    if (!product) {
        throw new AppError(404, "El producto no fue encontrado");
    }

    return { product };
}

async function deactivateProduct(id) {
    const productId = requirePositiveInteger(id, "id");
    const product = await repository.deactivateProduct(pool, productId);

    if (!product) {
        throw new AppError(404, "El producto no fue encontrado");
    }

    return { product };
}

// Promociones

function validatePromotionPayload(body) {
    const title = requireNonEmptyString(body.title, "title", 100);
    const promotionCategoryId = requirePositiveInteger(
        body.promotionCategoryId,
        "promotionCategoryId",
    );
    const description = requireNonEmptyString(
        body.description,
        "description",
        10000,
    );
    const image = requireNonEmptyString(body.image, "image", 10000);

    let buyQuantity = null;
    if (body.buyQuantity !== undefined && body.buyQuantity !== null) {
        buyQuantity = requirePositiveInteger(body.buyQuantity, "buyQuantity");
    }

    let payQuantity = null;
    if (body.payQuantity !== undefined && body.payQuantity !== null) {
        payQuantity = requirePositiveInteger(body.payQuantity, "payQuantity");
    }

    if (
        buyQuantity !== null &&
        payQuantity !== null &&
        buyQuantity <= payQuantity
    ) {
        throw new AppError(
            400,
            "El campo 'buyQuantity' debe ser mayor que 'payQuantity'",
        );
    }

    let discountPercentage = null;
    if (
        body.discountPercentage !== undefined &&
        body.discountPercentage !== null
    ) {
        discountPercentage = Number(body.discountPercentage);
        if (
            !Number.isFinite(discountPercentage) ||
            discountPercentage <= 0 ||
            discountPercentage > 100
        ) {
            throw new AppError(
                400,
                "El campo 'discountPercentage' debe estar entre 0 (exclusivo) y 100",
            );
        }
    }

    if (typeof body.deadline !== "string" || body.deadline.trim().length === 0) {
        throw new AppError(400, "El campo 'deadline' es obligatorio");
    }
    if (Number.isNaN(new Date(body.deadline).getTime())) {
        throw new AppError(400, "El campo 'deadline' debe ser una fecha válida");
    }
    const deadline = body.deadline;

    if (!Array.isArray(body.productIds)) {
        throw new AppError(400, "El campo 'productIds' debe ser una lista");
    }
    const productIds = body.productIds.map((productId) =>
        requirePositiveInteger(productId, "productIds"),
    );

    return {
        title,
        promotionCategoryId,
        description,
        image,
        buyQuantity,
        payQuantity,
        discountPercentage,
        deadline,
        productIds,
    };
}

async function withTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function runPromotionWrite(operation) {
    try {
        return await operation();
    } catch (error) {
        if (
            error.code === "23503" &&
            error.constraint === "fk_promotion_promotion_category"
        ) {
            throw new AppError(
                400,
                "La categoría de promoción indicada no existe",
            );
        }
        if (
            error.code === "23503" &&
            error.constraint === "fk_promotion_product_product"
        ) {
            throw new AppError(
                400,
                "Uno de los productos indicados en 'productIds' no existe",
            );
        }
        throw error;
    }
}

async function listPromotions(query) {
    const { search, page, pageSize, offset } = parseListQuery(query);
    const rows = await repository.listPromotionsAdmin(pool, {
        search,
        pageSize,
        offset,
    });
    const { items, pagination } = buildPagination(rows, { page, pageSize });

    const productIdRows = await repository.findPromotionProductIdsByPromotionIds(
        pool,
        items.map((item) => item.id),
    );
    const productIdsByPromotionId = new Map();
    for (const row of productIdRows) {
        const list = productIdsByPromotionId.get(row.promotionId) ?? [];
        list.push(row.productId);
        productIdsByPromotionId.set(row.promotionId, list);
    }

    return {
        items: items.map((item) => ({
            ...item,
            productIds: productIdsByPromotionId.get(item.id) ?? [],
        })),
        pagination,
    };
}

async function createPromotion(body) {
    const { productIds, ...payload } = validatePromotionPayload(body);

    if (new Date(payload.deadline).getTime() <= Date.now()) {
        throw new AppError(400, "El campo 'deadline' debe ser una fecha futura");
    }

    const promotionId = await runPromotionWrite(() =>
        withTransaction(async (client) => {
            const id = await repository.createPromotion(client, payload);
            await repository.replacePromotionProducts(client, id, productIds);
            return id;
        }),
    );

    const promotion = await repository.findPromotionById(pool, promotionId);
    const linkedProductIds = await repository.findPromotionProductIds(
        pool,
        promotionId,
    );

    return { promotion: { ...promotion, productIds: linkedProductIds } };
}

async function updatePromotion(id, body) {
    const promotionId = requirePositiveInteger(id, "id");
    const { productIds, ...payload } = validatePromotionPayload(body);
    const active = requireBoolean(body.active, "active");

    const updated = await runPromotionWrite(() =>
        withTransaction(async (client) => {
            const result = await repository.updatePromotion(client, promotionId, {
                ...payload,
                active,
            });
            if (!result) {
                return null;
            }
            await repository.replacePromotionProducts(
                client,
                promotionId,
                productIds,
            );
            return result;
        }),
    );

    if (!updated) {
        throw new AppError(404, "La promoción no fue encontrada");
    }

    const promotion = await repository.findPromotionById(pool, promotionId);
    const linkedProductIds = await repository.findPromotionProductIds(
        pool,
        promotionId,
    );

    return { promotion: { ...promotion, productIds: linkedProductIds } };
}

async function deactivatePromotion(id) {
    const promotionId = requirePositiveInteger(id, "id");
    const promotion = await repository.deactivatePromotion(pool, promotionId);

    if (!promotion) {
        throw new AppError(404, "La promoción no fue encontrada");
    }

    const linkedProductIds = await repository.findPromotionProductIds(
        pool,
        promotionId,
    );

    return { promotion: { ...promotion, productIds: linkedProductIds } };
}

// Ventajas de ser miembro

function validateMemberPromotionPayload(body) {
    const title = requireNonEmptyString(body.title, "title", 100);
    const description = requireNonEmptyString(
        body.description,
        "description",
        10000,
    );
    const image = requireNonEmptyString(body.image, "image", 10000);
    const benefit = requireNonEmptyString(body.benefit, "benefit", 150);

    return { title, description, image, benefit };
}

async function listMemberPromotions(query) {
    const { search, page, pageSize, offset } = parseListQuery(query);
    const rows = await repository.listMemberPromotionsAdmin(pool, {
        search,
        pageSize,
        offset,
    });
    return buildPagination(rows, { page, pageSize });
}

async function createMemberPromotion(body) {
    const payload = validateMemberPromotionPayload(body);
    const memberPromotion = await repository.createMemberPromotion(
        pool,
        payload,
    );
    return { memberPromotion };
}

async function updateMemberPromotion(id, body) {
    const memberPromotionId = requirePositiveInteger(id, "id");
    const payload = validateMemberPromotionPayload(body);
    const active = requireBoolean(body.active, "active");

    const memberPromotion = await repository.updateMemberPromotion(
        pool,
        memberPromotionId,
        { ...payload, active },
    );

    if (!memberPromotion) {
        throw new AppError(404, "La ventaja de ser miembro no fue encontrada");
    }

    return { memberPromotion };
}

async function deactivateMemberPromotion(id) {
    const memberPromotionId = requirePositiveInteger(id, "id");
    const memberPromotion = await repository.deactivateMemberPromotion(
        pool,
        memberPromotionId,
    );

    if (!memberPromotion) {
        throw new AppError(404, "La ventaja de ser miembro no fue encontrada");
    }

    return { memberPromotion };
}

module.exports = {
    listProductCategories,
    createProductCategory,
    updateProductCategory,
    deleteProductCategory,
    listPromotionCategories,
    createPromotionCategory,
    updatePromotionCategory,
    deletePromotionCategory,
    listProducts,
    createProduct,
    updateProduct,
    deactivateProduct,
    listPromotions,
    createPromotion,
    updatePromotion,
    deactivatePromotion,
    listMemberPromotions,
    createMemberPromotion,
    updateMemberPromotion,
    deactivateMemberPromotion,
};
