const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const repository = require("./cart.repository");

function mapCartItemRow(item) {
    const baseItem = {
        id: item.cartItemId,
        type: item.itemType,
        quantity: item.quantity,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };

    if (item.itemType === "product") {
        return {
            ...baseItem,
            product: {
                id: item.productId,
                name: item.productName,
                productCategoryId: item.productCategoryId,
                productCategoryName: item.productCategoryName,
                price: item.productPrice,
                image: item.productImage,
                description: item.productDescription,
            },
            promotion: null,
        };
    }

    return {
        ...baseItem,
        product: null,
        promotion: {
            id: item.promotionId,
            title: item.promotionTitle,
            buyQuantity: item.buyQuantity,
            payQuantity: item.payQuantity,
            discountPercentage: item.discountPercentage,
            promotionCategoryId: item.promotionCategoryId,
            promotionCategoryName: item.promotionCategoryName,
            description: item.promotionDescription,
            image: item.promotionImage,
            deadline: item.promotionDeadline,
            isExpired: item.isPromotionExpired,
        },
    };
}

/*
 * El usuario aún no agregó nada al carrito.
 * No se crea un carrito vacío solo por consultarlo.
 */
async function getCart(userId) {
    const cart = await repository.findCartByUserId(pool, userId);

    if (!cart) {
        return { id: null, createdAt: null, updatedAt: null, items: [] };
    }

    const itemRows = await repository.listCartItems(pool, cart.id);

    return {
        id: cart.id,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
        items: itemRows.map(mapCartItemRow),
    };
}

/*
 * Se valida primero para devolver 404 claro
 * y no depender de un error de foreign key.
 */
async function addProduct({ userId, productId, quantity }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const product = await repository.findProductById(client, productId);

        if (!product) {
            await client.query("ROLLBACK");
            throw new AppError(404, "El producto no fue encontrado");
        }

        const cart = await repository.upsertCartForUser(client, userId);

        const cartItem = await repository.upsertProductCartItem(client, {
            cartId: cart.id,
            productId,
            quantity,
        });

        await client.query("COMMIT");

        return {
            id: cartItem.cartItemId,
            cartId: cartItem.shoppingCartId,
            quantity: cartItem.quantity,
            createdAt: cartItem.createdAt,
            updatedAt: cartItem.updatedAt,
            product: {
                id: product.id,
                name: product.name,
                productCategoryId: product.productCategoryId,
                price: product.price,
                image: product.image,
                description: product.description,
            },
        };
    } catch (error) {
        if (!(error instanceof AppError)) {
            await client.query("ROLLBACK");
        }
        throw error;
    } finally {
        client.release();
    }
}

async function addPromotion({ userId, promotionId, quantity }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const promotion = await repository.findPromotionById(client, promotionId);

        if (!promotion) {
            await client.query("ROLLBACK");
            throw new AppError(404, "La promoción no fue encontrada");
        }

        if (
            promotion.deadline !== null &&
            new Date(promotion.deadline) < new Date()
        ) {
            await client.query("ROLLBACK");
            throw new AppError(
                409,
                "La promoción ya venció y no puede agregarse al carrito",
            );
        }

        const cart = await repository.upsertCartForUser(client, userId);

        const cartItem = await repository.upsertPromotionCartItem(client, {
            cartId: cart.id,
            promotionId,
            quantity,
        });

        await client.query("COMMIT");

        return {
            id: cartItem.cartItemId,
            cartId: cartItem.shoppingCartId,
            quantity: cartItem.quantity,
            createdAt: cartItem.createdAt,
            updatedAt: cartItem.updatedAt,
            promotion: {
                id: promotion.id,
                title: promotion.title,
                buyQuantity: promotion.buyQuantity,
                payQuantity: promotion.payQuantity,
                discountPercentage: promotion.discountPercentage,
                promotionCategoryId: promotion.promotionCategoryId,
                promotionCategoryName: promotion.promotionCategoryName,
                description: promotion.description,
                image: promotion.image,
                deadline: promotion.deadline,
            },
        };
    } catch (error) {
        if (!(error instanceof AppError)) {
            await client.query("ROLLBACK");
        }
        throw error;
    } finally {
        client.release();
    }
}

async function updateItemQuantity({ cartItemId, quantity, userId }) {
    const cartItem = await repository.updateCartItemQuantity(pool, {
        quantity,
        cartItemId,
        userId,
    });

    if (!cartItem) {
        throw new AppError(
            404,
            "El ítem del carrito no fue encontrado o no pertenece al usuario autenticado",
        );
    }

    const itemType = cartItem.productId !== null ? "product" : "promotion";

    return {
        id: cartItem.cartItemId,
        cartId: cartItem.shoppingCartId,
        type: itemType,
        productId: cartItem.productId,
        promotionId: cartItem.promotionId,
        quantity: cartItem.quantity,
        createdAt: cartItem.createdAt,
        updatedAt: cartItem.updatedAt,
    };
}

async function deleteItem({ cartItemId, userId }) {
    const deletedCartItem = await repository.deleteCartItem(pool, {
        cartItemId,
        userId,
    });

    if (!deletedCartItem) {
        throw new AppError(
            404,
            "El ítem del carrito no fue encontrado o no pertenece al usuario autenticado",
        );
    }

    const itemType =
        deletedCartItem.productId !== null ? "product" : "promotion";

    return {
        id: deletedCartItem.cartItemId,
        cartId: deletedCartItem.shoppingCartId,
        type: itemType,
        productId: deletedCartItem.productId,
        promotionId: deletedCartItem.promotionId,
        quantity: deletedCartItem.quantity,
        createdAt: deletedCartItem.createdAt,
        updatedAt: deletedCartItem.updatedAt,
    };
}

/*
 * Se actualiza updated_at solo si el carrito existe.
 * Aunque no tuviera ítems, sigue siendo una operación válida.
 */
async function clearCart(userId) {
    const result = await repository.deleteAllCartItems(pool, userId);
    await repository.touchCartUpdatedAt(pool, userId);

    return { deletedItemsCount: result.rowCount };
}

module.exports = {
    getCart,
    addProduct,
    addPromotion,
    updateItemQuantity,
    deleteItem,
    clearCart,
};
