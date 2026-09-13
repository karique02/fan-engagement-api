const { getBooleanParameter, getIntegerParameter } = require("../../modules/parameters/parameters.repository");

/*
 * Visibilidad de la promoción de envío gratis (promotion_category_id = 3):
 * igual para todos los fans, decidida solo por el backend — enabled +
 * franja horaria en America/Lima, mismo criterio que
 * personalizedNotifications.job.js.
 */
async function isFreeShippingPromotionVisible(pool) {
    const enabled = await getBooleanParameter(pool, "free_shipping_notice_enabled", true);

    if (!enabled) {
        return false;
    }

    const startHour = await getIntegerParameter(pool, "free_shipping_notice_start_hour", 9);
    const endHour = await getIntegerParameter(pool, "free_shipping_notice_end_hour", 21);

    const currentHour = Number.parseInt(
        new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            hour: "numeric",
            hour12: false,
        }).format(new Date()),
        10,
    );

    return currentHour >= startHour && currentHour < endHour;
}

/*
 * Un fan que ya compró la promoción de envío gratis (cualquier compra no
 * cancelada) deja de verla — a diferencia de isFreeShippingPromotionVisible,
 * esto sí es por usuario, no global.
 */
async function hasUserPurchasedFreeShippingPromotion(pool, userId) {
    const result = await pool.query(
        `
            SELECT 1
            FROM public.purchase pu
            INNER JOIN public.purchase_item pi ON pi.purchase_id = pu.id
            INNER JOIN public.promotion pr ON pr.id = pi.promotion_id
            WHERE pu.user_id = $1
              AND pu.status <> 'cancelled'
              AND pr.promotion_category_id = 3
            LIMIT 1
        `,
        [userId],
    );

    return result.rowCount > 0;
}

module.exports = { isFreeShippingPromotionVisible, hasUserPurchasedFreeShippingPromotion };
