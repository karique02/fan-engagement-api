const { sendSuccess, sendError } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./auth.service");
const { parseRegisterInput, parseLoginInput } = require("./auth.schema");
const { renderEmailVerificationPage } = require("./templates/verificationPage");

/*
 * Público.
 *
 * Registra un usuario y devuelve una sesión iniciada.
 *
 * Body:
 * {
 *   "username": "nuevo_hincha",
 *   "email": "nuevo@example.com",
 *   "password": "Password123",
 *   "fullName": "Nombre completo",
 *   "cellphone": "+51987654321",
 *   "fcmToken": "opcional"
 * }
 */
const register = asyncHandler(async (req, res) => {
    const parsed = parseRegisterInput(req.body);

    if (!parsed.ok) {
        return sendError(res, req, {
            statusCode: parsed.statusCode,
            message: parsed.message,
        });
    }

    const result = await service.register(parsed.value);

    return sendSuccess(res, req, {
        statusCode: 201,
        message:
            "Usuario registrado exitosamente. Verifique su correo antes de iniciar sesión.",
        data: result,
    });
});

/*
 * Público.
 *
 * Permite iniciar sesión con username o email.
 * Solo permite login si el correo fue verificado
 * y el usuario tiene state = 'active'.
 *
 * Body:
 * {
 *   "identifier": "karique01",
 *   "password": "..."
 * }
 *
 * O:
 * {
 *   "identifier": "kariquekeiter@gmail.com",
 *   "password": "..."
 * }
 */
const login = asyncHandler(async (req, res) => {
    const parsed = parseLoginInput(req.body);

    if (!parsed.ok) {
        return sendError(res, req, {
            statusCode: parsed.statusCode,
            message: parsed.message,
        });
    }

    const result = await service.login(parsed.value);

    return sendSuccess(res, req, {
        message: "Inicio de sesión completado exitosamente",
        data: result,
    });
});

const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (typeof token !== "string" || token.length === 0) {
        return res
            .status(400)
            .type("html")
            .send(
                renderEmailVerificationPage({
                    success: false,
                    title: "Enlace inválido",
                    message: "El enlace de verificación no es válido.",
                }),
            );
    }

    const verified = await service.verifyEmail(token);

    if (!verified) {
        return res
            .status(400)
            .type("html")
            .send(
                renderEmailVerificationPage({
                    success: false,
                    title: "Enlace vencido o utilizado",
                    message:
                        "Este enlace no es válido, ya fue utilizado o expiró. Solicita uno nuevo desde la aplicación.",
                }),
            );
    }

    return res
        .status(200)
        .type("html")
        .send(
            renderEmailVerificationPage({
                success: true,
                title: "Correo verificado correctamente",
                message:
                    "Tu cuenta ya está activa. Ahora puedes volver a la aplicación e iniciar sesión.",
            }),
        );
});

const resendEmailVerification = asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};

    if (typeof email !== "string" || email.trim().length === 0) {
        return sendError(res, req, {
            statusCode: 400,
            message: "El correo electrónico es obligatorio.",
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    await service.resendEmailVerification(normalizedEmail);

    return sendSuccess(res, req, {
        message:
            "Si la cuenta existe y requiere verificación, se ha enviado un correo electrónico.",
    });
});

module.exports = { register, login, verifyEmail, resendEmailVerification };
