/*
 * Query compartida por purchase_item para calcular el unit_price efectivo de
 * una promoción a partir de los productos que agrupa (promotion_product):
 * precio promedio de esos productos, ajustado por discount_percentage o por
 * buy_quantity/pay_quantity, según cuál tenga la promoción. Si la promoción
 * no tiene productos asociados o ninguno de los dos ajustes aplica, resuelve
 * a NULL (el caller decide el fallback a 0).
 */
const PROMOTION_UNIT_PRICE_SELECT = `
    CASE
        WHEN pr.id IS NULL THEN NULL
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
