const INTERACTION_TEXT_FILTER_REGEX = /^[\p{L}0-9 ._-]{0,100}$/u;
const INTERACTION_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INTERACTION_PAGE_SIZES = [15, 30, 45];
const PURCHASE_PAGE_SIZES = [10, 20, 30];
const PURCHASE_ITEM_TYPES = ["product", "promotion"];
const PURCHASE_STATUSES = ["pending", "completed", "cancelled"];

module.exports = {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_DATE_REGEX,
    INTERACTION_PAGE_SIZES,
    PURCHASE_PAGE_SIZES,
    PURCHASE_ITEM_TYPES,
    PURCHASE_STATUSES,
};
