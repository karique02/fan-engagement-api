/*
 * Contrato: { ok: true, value: {...} } | { ok: false, statusCode, message }
 */
function parseRegisterInput(body) {
    const { username, email, password, fullName, cellphone } = body ?? {};

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof fullName !== "string" ||
        typeof cellphone !== "string"
    ) {
        return {
            ok: false,
            statusCode: 400,
            message:
                "El nombre de usuario, correo electrónico, contraseña, nombre completo y número de celular son obligatorios.",
        };
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();
    const normalizedCellphone = cellphone.trim();

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
        return {
            ok: false,
            statusCode: 400,
            message:
                "El nombre de usuario debe contener entre 3 y 30 caracteres, incluyendo letras minúsculas, números o guiones bajos",
        };
    }

    if (
        normalizedEmail.length === 0 ||
        normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return {
            ok: false,
            statusCode: 400,
            message: "El correo electrónico es inválido",
        };
    }

    if (password.length < 8) {
        return {
            ok: false,
            statusCode: 400,
            message: "La contraseña debe contener al menos 8 caracteres",
        };
    }

    if (normalizedFullName.length === 0 || normalizedFullName.length > 300) {
        return {
            ok: false,
            statusCode: 400,
            message: "El nombre completo debe contener entre 1 y 300 caracteres",
        };
    }

    if (
        !/^\+?[0-9]{7,15}$/.test(normalizedCellphone) ||
        normalizedCellphone.length > 16
    ) {
        return {
            ok: false,
            statusCode: 400,
            message:
                "El número de celular debe contener entre 7 y 15 dígitos y puede comenzar con +",
        };
    }

    return {
        ok: true,
        value: {
            username: normalizedUsername,
            email: normalizedEmail,
            password,
            fullName: normalizedFullName,
            cellphone: normalizedCellphone,
        },
    };
}

function parseLoginInput(body) {
    const { identifier, password } = body ?? {};

    if (
        typeof identifier !== "string" ||
        identifier.trim().length === 0 ||
        typeof password !== "string" ||
        password.length === 0
    ) {
        return {
            ok: false,
            statusCode: 400,
            message: "El nombre de usuario y la contraseña son obligatorios.",
        };
    }

    return {
        ok: true,
        value: {
            identifier: identifier.trim().toLowerCase(),
            password,
            client: body?.client,
        },
    };
}

module.exports = { parseRegisterInput, parseLoginInput };
