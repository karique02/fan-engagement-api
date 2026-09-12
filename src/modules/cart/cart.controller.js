const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./cart.service");

/*
 * Protegido.
 *
 * Recupera el carrito actualizado del usuario autenticado.
 *
 * Incluye productos y promociones como ítems separados.
 * Una promoción puede no tener productos asociados.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const getCart = asyncHandler(async (req, res) => {
    const cart = await service.getCart(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        message: "Carrito recuperado exitosamente",
        data: { cart },
    });
});

/*
 * Protegido.
 *
 * Agrega un producto al carrito del usuario autenticado.
 *
 * Si el carrito no existe, lo crea.
 * Si el producto ya existe en el carrito, incrementa su cantidad.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "productId": 1,
 *   "quantity": 2
 * }
 */
const addProduct = asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body ?? {};

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El productId debe ser un entero positivo",
        });
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "La quantity debe ser un entero positivo",
        });
    }

    const cartItem = await service.addProduct({
        userId: req.authenticatedUser.sub,
        productId,
        quantity,
    });

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Producto agregado al carrito exitosamente",
        data: { cartItem },
    });
});

/*
 * Protegido.
 *
 * Agrega una promoción al carrito del usuario autenticado.
 *
 * Si el carrito no existe, lo crea.
 * Si la promoción ya existe en el carrito, incrementa su cantidad.
 *
 * No requiere que la promoción tenga productos asociados.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "promotionId": 1,
 *   "quantity": 1
 * }
 */
const addPromotion = asyncHandler(async (req, res) => {
    const { promotionId, quantity } = req.body ?? {};

    if (!Number.isSafeInteger(promotionId) || promotionId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El promotionId debe ser un entero positivo",
        });
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "La quantity debe ser un entero positivo",
        });
    }

    const cartItem = await service.addPromotion({
        userId: req.authenticatedUser.sub,
        promotionId,
        quantity,
    });

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Promoción agregada al carrito exitosamente",
        data: { cartItem },
    });
});

/*
 * Protegido.
 *
 * Actualiza la cantidad de un ítem del carrito
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Params:
 * {
 *   "cartItemId": 12
 * }
 *
 * Body:
 * {
 *   "quantity": 3
 * }
 */
const updateItemQuantity = asyncHandler(async (req, res) => {
    const cartItemId = Number(req.params.cartItemId);
    const { quantity } = req.body ?? {};

    if (!Number.isSafeInteger(cartItemId) || cartItemId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El cartItemId debe ser un entero positivo",
        });
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "La quantity debe ser un entero positivo",
        });
    }

    /*
     * Solo permite modificar ítems del carrito
     * perteneciente al usuario autenticado.
     */
    const cartItem = await service.updateItemQuantity({
        cartItemId,
        quantity,
        userId: req.authenticatedUser.sub,
    });

    return sendSuccess(res, req, {
        message: "Cantidad del ítem del carrito actualizada exitosamente",
        data: { cartItem },
    });
});

/*
 * Protegido.
 *
 * Elimina un ítem específico del carrito
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Params:
 * {
 *   "cartItemId": 12
 * }
 */
const deleteItem = asyncHandler(async (req, res) => {
    const cartItemId = Number(req.params.cartItemId);

    if (!Number.isSafeInteger(cartItemId) || cartItemId <= 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El cartItemId debe ser un entero positivo",
        });
    }

    /*
     * Solo elimina ítems que pertenezcan al carrito
     * del usuario autenticado.
     */
    const deletedCartItem = await service.deleteItem({
        cartItemId,
        userId: req.authenticatedUser.sub,
    });

    return sendSuccess(res, req, {
        message: "Ítem eliminado del carrito exitosamente",
        data: { deletedCartItem },
    });
});

/*
 * Protegido.
 *
 * Vacía completamente el carrito del usuario autenticado.
 *
 * El carrito permanece creado; solo se eliminan sus ítems.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
const clearCart = asyncHandler(async (req, res) => {
    const result = await service.clearCart(req.authenticatedUser.sub);

    return sendSuccess(res, req, {
        message: "Carrito vaciado exitosamente",
        data: result,
    });
});

module.exports = {
    getCart,
    addProduct,
    addPromotion,
    updateItemQuantity,
    deleteItem,
    clearCart,
};
