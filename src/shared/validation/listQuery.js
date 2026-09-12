const { sendError } = require("../http/response");
const {
    INTERACTION_TEXT_FILTER_REGEX,
    INTERACTION_DATE_REGEX,
    INTERACTION_PAGE_SIZES,
} = require("./patterns");

/*
 * Filtrado/paginado compartido por los endpoints de listado de interacciones
 * (products/interaction/all, promotions/interaction/all).
 *
 * Valida los query params y responde el error 400 correspondiente si alguno
 * es inválido. Devuelve `null` cuando ya se envió una respuesta de error
 * (el caller debe simplemente `return` en ese caso) o el objeto de filtros
 * ya parseado/normalizado en caso contrario.
 */
function parseInteractionListQuery(req, res, { entityParam }) {
    const query = req.query;

    const readTextFilter = (paramName) => {
        const raw = query[paramName];
        if (raw === undefined || raw === null || raw === "") {
            return { value: undefined };
        }
        const value = String(raw);
        if (!INTERACTION_TEXT_FILTER_REGEX.test(value)) {
            return {
                error: `El parámetro '${paramName}' contiene caracteres no permitidos`,
            };
        }
        return { value };
    };

    const usernameFilter = readTextFilter("username");
    if (usernameFilter.error) {
        sendError(res, req, { statusCode: 400, message: usernameFilter.error });
        return null;
    }

    const entityFilter = readTextFilter(entityParam);
    if (entityFilter.error) {
        sendError(res, req, { statusCode: 400, message: entityFilter.error });
        return null;
    }

    const readDateFilter = (paramName) => {
        const raw = query[paramName];
        if (raw === undefined || raw === null || raw === "") {
            return { value: undefined };
        }
        const value = String(raw);
        if (!INTERACTION_DATE_REGEX.test(value)) {
            return {
                error: `El parámetro '${paramName}' debe tener el formato YYYY-MM-DD`,
            };
        }
        return { value };
    };

    const dateFromFilter = readDateFilter("dateFrom");
    if (dateFromFilter.error) {
        sendError(res, req, { statusCode: 400, message: dateFromFilter.error });
        return null;
    }

    const dateToFilter = readDateFilter("dateTo");
    if (dateToFilter.error) {
        sendError(res, req, { statusCode: 400, message: dateToFilter.error });
        return null;
    }

    if (
        dateFromFilter.value &&
        dateToFilter.value &&
        dateFromFilter.value > dateToFilter.value
    ) {
        sendError(res, req, {
            statusCode: 400,
            message: "La fecha 'desde' no puede ser posterior a la fecha 'hasta'",
        });
        return null;
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
        username: usernameFilter.value,
        entityValue: entityFilter.value,
        dateFrom: dateFromFilter.value,
        dateTo: dateToFilter.value,
        page,
        pageSize,
    };
}

module.exports = { parseInteractionListQuery };
