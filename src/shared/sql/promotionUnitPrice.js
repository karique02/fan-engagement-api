/*
 * Query compartida por purchase_item para calcular el unit_price efectivo de
 * una promoción. La mayoría de promociones lo derivan de los productos que
 * agrupan (promotion_product): precio promedio de esos productos, ajustado
 * por discount_percentage o por buy_quantity/pay_quantity, según cuál tenga
 * la promoción. fixed_price tiene prioridad sobre todo lo anterior — está
 * pensado únicamente para una promoción sin productos ligados en
 * promotion_product (ej. la de envío gratis, spec 15), no para combinarse con
 * un promotion_product existente. Si la promoción no tiene productos
 * asociados, no tiene fixed_price, y ninguno de los otros ajustes aplica,
 * resuelve a NULL (el caller decide el fallback a 0).
 */
const PROMOTION_UNIT_PRICE_SELECT = `
    CASE
        WHEN pr.id IS NULL THEN NULL
        WHEN pr.fixed_price IS NOT NULL THEN pr.fixed_price
        WHEN pr.discount_percentage IS NOT NULL
            THEN promo_avg.avg_price * (1 - pr.discount_percentage / 100)
        WHEN pr.buy_quantity IS NOT NULL
            AND pr.pay_quantity IS NOT NULL
            AND pr.buy_quantity > 0
            THEN promo_avg.avg_price * pr.pay_quantity::numeric / pr.buy_quantity
        ELSE NULL
    END
`;
const PROMOTION_UNIT_PRICE_JOIN = `
    LEFT JOIN (
        SELECT pp.promotion_id, AVG(prod.price) AS avg_price
        FROM public.promotion_product pp
        INNER JOIN public.product prod ON prod.id = pp.product_id
        GROUP BY pp.promotion_id
    ) promo_avg ON promo_avg.promotion_id = pr.id
`;

module.exports = { PROMOTION_UNIT_PRICE_SELECT, PROMOTION_UNIT_PRICE_JOIN };
