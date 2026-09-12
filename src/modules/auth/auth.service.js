const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const pool = require("../../config/database");
const env = require("../../config/env");
const AppError = require("../../shared/errors/AppError");
const repository = require("./auth.repository");
const { sendEmailVerificationEmail } = require("./templates/verificationEmail");

async function register({ username, email, password, fullName, cellphone }) {
    const client = await pool.connect();

    try {
        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
        });

        await client.query("BEGIN");

        const user = await repository.insertUser(client, {
            username,
            email,
            passwordHash,
            cellphone,
            fullName,
        });

        const rawToken = await repository.createOrReplaceEmailVerification(
            client,
            user.id,
        );

        await client.query("COMMIT");

        try {
            await sendEmailVerificationEmail({ email: user.email, rawToken });
        } catch (emailError) {
            console.error("Email verification delivery error:", emailError);

            throw new AppError(
                503,
                "La cuenta fue creada, pero no se pudo enviar el correo de verificación. Solicite un nuevo correo de verificación.",
            );
        }

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                cellphone: user.cellphone,
                state: user.state,
            },
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        await client.query("ROLLBACK");

        if (error.code === "23505") {
            const duplicateFieldByConstraint = {
                uq_usuario_username: "username",
                uq_usuario_email: "email",
                uq_usuario_celular: "cellphone",
            };

            const duplicatedField =
                duplicateFieldByConstraint[error.constraint] ?? "user data";

            throw new AppError(
                409,
                `${duplicatedField} ya se encuentra registrado.`,
            );
        }

        throw error;
    } finally {
        client.release();
    }
}

async function login({ identifier, password, client: loginClient }) {
    const user = await repository.findUserByIdentifier(pool, identifier);

    if (!user) {
        throw new AppError(401, "Credenciales inválidas");
    }

    const passwordIsValid = await argon2.verify(user.password_hash, password);

    if (!passwordIsValid) {
        throw new AppError(401, "Credenciales inválidas");
    }

    if (user.state !== "active") {
        throw new AppError(
            403,
            "Se requiere verificar el correo electrónico antes de iniciar sesión",
            { state: user.state },
        );
    }

    if (loginClient === "web" && Number(user.user_type) !== 2) {
        throw new AppError(
            403,
            "Tu usuario no tiene permisos de administrador para acceder a esta plataforma. Contacta a un administrador si crees que esto es un error.",
            { reason: "not_admin" },
        );
    }

    const token = jwt.sign(
        {
            sub: user.id,
            username: user.username,
            email: user.email,
        },
        env.jwtSecret,
        { expiresIn: "7d" },
    );

    return {
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: "7d",
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            cellphone: user.cellphone,
            state: user.state,
            userType: Number(user.user_type),
        },
    };
}

async function verifyEmail(token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    return repository.consumeVerificationToken(pool, tokenHash);
}

async function resendEmailVerification(normalizedEmail) {
    const client = await pool.connect();

    try {
        const user = await repository.findUserForResend(client, normalizedEmail);

        /*
         * Respuesta genérica para no revelar
         * si el correo existe o no existe.
         */
        if (!user || user.state !== "created") {
            return;
        }

        await client.query("BEGIN");

        const rawToken = await repository.createOrReplaceEmailVerification(
            client,
            user.id,
        );

        await client.query("COMMIT");

        try {
            await sendEmailVerificationEmail({ email: user.email, rawToken });
        } catch (emailError) {
            console.error("Resend verification email error:", emailError);
        }
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { register, login, verifyEmail, resendEmailVerification };
