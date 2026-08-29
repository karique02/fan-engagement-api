require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
}

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
}

if (!process.env.API_PUBLIC_URL) {
    throw new Error("API_PUBLIC_URL is required");
}

if (!process.env.SMTP_USER) {
    throw new Error("SMTP_USER is required");
}

if (!process.env.SMTP_PASS) {
    throw new Error("SMTP_PASS is required");
}

if (!process.env.MAIL_FROM) {
    throw new Error("MAIL_FROM is required");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
});



const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
function createEmailVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    return {
        rawToken,
        tokenHash,
    };
}
async function createOrReplaceEmailVerification(
    client,
    userId,
) {
    const { rawToken, tokenHash } = createEmailVerificationToken();

    await client.query(
        `
            INSERT INTO public.email_verification (
                user_id,
                token_hash,
                expires_at,
                created_at,
                used_at
            )
            VALUES (
                $1,
                $2,
                NOW() + INTERVAL '24 hours',
                NOW(),
                NULL
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                token_hash = EXCLUDED.token_hash,
                expires_at = EXCLUDED.expires_at,
                created_at = NOW(),
                used_at = NULL;
        `,
        [userId, tokenHash],
    );

    return rawToken;
}
async function sendEmailVerificationEmail({
    email,
    rawToken,
}) {
    const verificationUrl =
        `${process.env.API_PUBLIC_URL}` +
        `/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    await mailTransporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: "Verifica tu correo - Walter Ormeño FC",
        text: [
            "Gracias por registrarte en el club deportivo Walter Ormeño.",
            "",
            "Para activar tu cuenta, abre este enlace:",
            verificationUrl,
            "",
            "Este enlace expira en 24 horas.",
        ].join("\n"),
        html: `
            <main style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 24px;">
                <h1>Verifica tu correo</h1>

                <p>
                    Gracias por registrarte en el club deportivo Walter Ormeño.
                </p>

                <p>
                    Para activar tu cuenta, haz clic en el siguiente botón:
                </p>

                <p style="margin: 32px 0;">
                    <a
                        href="${verificationUrl}"
                        style="
                            display: inline-block;
                            background: #EC111A;
                            color: #FFFFFF;
                            text-decoration: none;
                            padding: 12px 20px;
                            border-radius: 6px;
                            font-weight: bold;
                        "
                    >
                        Verificar correo
                    </a>
                </p>

                <p>
                    Este enlace expira en 24 horas.
                </p>

                <p>
                    Si no creaste esta cuenta, puedes ignorar este correo.
                </p>
            </main>
        `,
    });
}
function renderEmailVerificationPage({
    success,
    title,
    message,
}) {
    const color = success ? "#0F8A45" : "#B42318";

    return `
        <!doctype html>
        <html lang="es">
            <head>
                <meta charset="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title>${title}</title>
            </head>

            <body
                style="
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #F6F6F6;
                    font-family: Arial, sans-serif;
                "
            >
                <main
                    style="
                        width: min(90%, 460px);
                        box-sizing: border-box;
                        padding: 32px;
                        border-radius: 12px;
                        background: #FFFFFF;
                        text-align: center;
                        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
                    "
                >
                    <h1
                        style="
                            margin-top: 0;
                            color: ${color};
                        "
                    >
                        ${title}
                    </h1>

                    <p
                        style="
                            margin-bottom: 0;
                            color: #333333;
                            line-height: 1.5;
                        "
                    >
                        ${message}
                    </p>
                </main>
            </body>
        </html>
    `;
}
function sendSuccess(
    res,
    req,
    {
        statusCode = 200,
        message = "Solicitud completada correctamente.",
        data = null,
    } = {},
) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "success",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}
function sendError(
    res,
    req,
    {
        statusCode = 500,
        message = "Ocurrió un error inesperado.",
        data = null,
    } = {},
) {
    return res.status(statusCode).json({
        code: statusCode,
        status: "error",
        message,
        timestamp: new Date().toISOString(),
        method: req.method,
        data,
    });
}
function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return sendError(res, req, {
            statusCode: 401,
            message: "Se requiere token de autenticación",
        });
    }

    const token = authorization.substring("Bearer ".length);

    try {
        req.authenticatedUser = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return sendError(res, req, {
            statusCode: 401,
            message: "Token de autenticación inválido o expirado",
        });
    }
}
async function getIntegerParameter(parameterKey, defaultValue) {
    const result = await pool.query(
        `
            SELECT value
            FROM public.parameters
            WHERE key = $1
            LIMIT 1;
        `,
        [parameterKey],
    );

    if (result.rowCount === 0) {
        return defaultValue;
    }

    const parsedValue = Number.parseInt(result.rows[0].value, 10);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
        return defaultValue;
    }

    return parsedValue;
}
async function trainProductRecommendations(client) {
    await client.query(
        `
            DELETE FROM public.user_product_recommendation;
        `,
    );

    await client.query(
        `
            WITH product_similarity AS (
                SELECT
                    upi_a.product_id AS source_product_id,
                    upi_b.product_id AS recommended_product_id,
                    (
                        SUM(upi_a.rating * upi_b.rating)
                        /
                        NULLIF(
                            SQRT(SUM(upi_a.rating * upi_a.rating))
                            *
                            SQRT(SUM(upi_b.rating * upi_b.rating)),
                            0
                        )
                    ) AS similarity_score
                FROM public.user_product_interaction upi_a
                INNER JOIN public.user_product_interaction upi_b
                    ON upi_a.user_id = upi_b.user_id
                   AND upi_a.product_id <> upi_b.product_id
                GROUP BY
                    upi_a.product_id,
                    upi_b.product_id
            ),
            user_candidate_recommendation AS (
                SELECT
                    upi.user_id,
                    ps.recommended_product_id AS product_id,
                    SUM(upi.rating * ps.similarity_score) AS recommendation_score
                FROM public.user_product_interaction upi
                INNER JOIN product_similarity ps
                    ON ps.source_product_id = upi.product_id
                GROUP BY
                    upi.user_id,
                    ps.recommended_product_id
            ),
            ranked_recommendation AS (
                SELECT
                    user_id,
                    product_id,
                    recommendation_score,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY recommendation_score DESC
                    ) AS ranking
                FROM user_candidate_recommendation
            )
            INSERT INTO public.user_product_recommendation (
                user_id,
                product_id,
                recommendation_score,
                generated_at
            )
            SELECT
                user_id,
                product_id,
                ROUND(recommendation_score, 6),
                CURRENT_TIMESTAMP
            FROM ranked_recommendation
            WHERE ranking <= 30;
        `,
    );
}
async function trainPromotionRecommendations(client) {
    await client.query(
        `
            DELETE FROM public.user_promotion_recommendation;
        `,
    );

    await client.query(
        `
            WITH promotion_similarity AS (
                SELECT
                    upi_a.promotion_id AS source_promotion_id,
                    upi_b.promotion_id AS recommended_promotion_id,
                    (
                        SUM(upi_a.rating * upi_b.rating)
                        /
                        NULLIF(
                            SQRT(SUM(upi_a.rating * upi_a.rating))
                            *
                            SQRT(SUM(upi_b.rating * upi_b.rating)),
                            0
                        )
                    ) AS similarity_score
                FROM public.user_promotion_interaction upi_a
                INNER JOIN public.user_promotion_interaction upi_b
                    ON upi_a.user_id = upi_b.user_id
                   AND upi_a.promotion_id <> upi_b.promotion_id
                GROUP BY
                    upi_a.promotion_id,
                    upi_b.promotion_id
            ),
            user_candidate_recommendation AS (
                SELECT
                    upi.user_id,
                    ps.recommended_promotion_id AS promotion_id,
                    SUM(upi.rating * ps.similarity_score) AS recommendation_score
                FROM public.user_promotion_interaction upi
                INNER JOIN promotion_similarity ps
                    ON ps.source_promotion_id = upi.promotion_id
                GROUP BY
                    upi.user_id,
                    ps.recommended_promotion_id
            ),
            ranked_recommendation AS (
                SELECT
                    user_id,
                    promotion_id,
                    recommendation_score,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY recommendation_score DESC
                    ) AS ranking
                FROM user_candidate_recommendation
            )
            INSERT INTO public.user_promotion_recommendation (
                user_id,
                promotion_id,
                recommendation_score,
                generated_at
            )
            SELECT
                user_id,
                promotion_id,
                ROUND(recommendation_score, 6),
                CURRENT_TIMESTAMP
            FROM ranked_recommendation
            WHERE ranking <= 30;
        `,
    );
}
let isCollaborativeFilteringTrainingRunning = false;
async function trainCollaborativeFiltering() {
    if (isCollaborativeFilteringTrainingRunning) {
        console.log("Collaborative filtering training skipped because another training is already running");
        return {
            skipped: true,
            reason: "Training already running",
        };
    }

    isCollaborativeFilteringTrainingRunning = true;

    const client = await pool.connect();

    try {
        const startedAt = new Date();

        await client.query("BEGIN");

        await trainProductRecommendations(client);
        await trainPromotionRecommendations(client);

        await client.query("COMMIT");

        const finishedAt = new Date();

        console.log("Collaborative filtering training completed", {
            startedAt,
            finishedAt,
        });

        return {
            skipped: false,
            startedAt,
            finishedAt,
        };
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Collaborative filtering training failed", error);

        throw error;
    } finally {
        client.release();
        isCollaborativeFilteringTrainingRunning = false;
    }
}
function startCollaborativeFilteringTrainingScheduler() {
    const executeTrainingCycle = async () => {
        let intervalMinutes = 10;

        try {
            intervalMinutes = await getIntegerParameter(
                "collaborative_filtering_training_interval_minutes",
                10,
            );

            console.log(`Starting collaborative filtering training. Next interval: ${intervalMinutes} minutes`);

            await trainCollaborativeFiltering();
        } catch (error) {
            console.error("Scheduled collaborative filtering training failed", error);
        } finally {
            const nextExecutionDelayMilliseconds = intervalMinutes * 60 * 1000;

            setTimeout(
                executeTrainingCycle,
                nextExecutionDelayMilliseconds,
            );
        }
    };

    setTimeout(executeTrainingCycle, 10_000);
}


/*
 * Público.
 * Debe devolver texto plano, no JSON.
 */
app.get("/", (req, res) => {
    return res
        .status(200)
        .type("text/plain")
        .send("Hola mundo desde Fan Engagement API");
});
/*
 * Público.
 * Útil para saber que API y base de datos están operativas.
 */
app.get("/api/v1/health", async (req, res, next) => {
    try {
        await pool.query("SELECT 1");

        return sendSuccess(res, req, {
            message: "API y base de datos están funcionando correctamente",
            data: {
                service: "fan-engagement-api",
            },
        });
    } catch (error) {
        next(error);
    }
});



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
app.post("/api/v1/auth/register", async (req, res, next) => {
    const client = await pool.connect();

    try {
        const {
            username,
            email,
            password,
            fullName,
            cellphone,
        } = req.body ?? {};

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            typeof fullName !== "string" ||
            typeof cellphone !== "string"
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message:
                    "El nombre de usuario, correo electrónico, contraseña, nombre completo y número de celular son obligatorios.",
            });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedFullName = fullName.trim();
        const normalizedCellphone = cellphone.trim();

        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
            return sendError(res, req, {
                statusCode: 400,
                message:
                    "El nombre de usuario debe contener entre 3 y 30 caracteres, incluyendo letras minúsculas, números o guiones bajos",
            });
        }

        if (
            normalizedEmail.length === 0 ||
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message: "El correo electrónico es inválido",
            });
        }

        if (password.length < 8) {
            return sendError(res, req, {
                statusCode: 400,
                message: "La contraseña debe contener al menos 8 caracteres",
            });
        }

        if (
            normalizedFullName.length === 0 ||
            normalizedFullName.length > 300
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message: "El nombre completo debe contener entre 1 y 300 caracteres",
            });
        }

        if (
            !/^\+?[0-9]{7,15}$/.test(normalizedCellphone) ||
            normalizedCellphone.length > 16
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message:
                    "El número de celular debe contener entre 7 y 15 dígitos y puede comenzar con +",
            });
        }

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
        });

        await client.query("BEGIN");

        const insertUserResult = await client.query(
            `
                INSERT INTO public."user" (
                    username,
                    email,
                    password_hash,
                    cellphone,
                    full_name,
                    state,
                    email_verified_at
                )
                VALUES ($1, $2, $3, $4, $5, 'created', NULL)
                RETURNING
                    id,
                    username,
                    email,
                    full_name,
                    cellphone,
                    state;
            `,
            [
                normalizedUsername,
                normalizedEmail,
                passwordHash,
                normalizedCellphone,
                normalizedFullName,
            ],
        );

        const user = insertUserResult.rows[0];

        const rawToken = await createOrReplaceEmailVerification(
            client,
            user.id,
        );

        await client.query("COMMIT");

        try {
            await sendEmailVerificationEmail({
                email: user.email,
                rawToken,
            });
        } catch (emailError) {
            console.error("Email verification delivery error:", emailError);

            return sendError(res, req, {
                statusCode: 503,
                message:
                    "La cuenta fue creada, pero no se pudo enviar el correo de verificación. Solicite un nuevo correo de verificación.",
            });
        }

        return sendSuccess(res, req, {
            statusCode: 201,
            message:
                "Usuario registrado exitosamente. Verifique su correo antes de iniciar sesión.",
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: user.full_name,
                    cellphone: user.cellphone,
                    state: user.state,
                },
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");

        if (error.code === "23505") {
            const duplicateFieldByConstraint = {
                uq_usuario_username: "username",
                uq_usuario_email: "email",
                uq_usuario_celular: "cellphone",
            };

            const duplicatedField =
                duplicateFieldByConstraint[error.constraint] ?? "user data";

            return sendError(res, req, {
                statusCode: 409,
                message: `${duplicatedField} ya se encuentra registrado.`,
            });
        }

        next(error);
    } finally {
        client.release();
    }
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
app.post("/api/v1/auth/login", async (req, res, next) => {
    try {
        const { identifier, password } = req.body ?? {};

        if (
            typeof identifier !== "string" ||
            identifier.trim().length === 0 ||
            typeof password !== "string" ||
            password.length === 0
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message: "El nombre de usuario y la contraseña son obligatorios.",
            });
        }

        const normalizedIdentifier = identifier.trim().toLowerCase();

        const query = `
            SELECT
                id,
                username,
                email,
                full_name,
                cellphone,
                password_hash,
                state,
                user_type
            FROM public."user"
            WHERE LOWER(username) = $1
               OR LOWER(email) = $1
            LIMIT 1;
        `;

        const result = await pool.query(query, [normalizedIdentifier]);

        const user = result.rows[0];

        if (!user) {
            return sendError(res, req, {
                statusCode: 401,
                message: "Credenciales inválidas",
            });
        }

        const passwordIsValid = await argon2.verify(
            user.password_hash,
            password,
        );

        if (!passwordIsValid) {
            return sendError(res, req, {
                statusCode: 401,
                message: "Credenciales inválidas",
            });
        }

        if (user.state !== "active") {
            return sendError(res, req, {
                statusCode: 403,
                message:
                    "Se requiere verificar el correo electrónico antes de iniciar sesión",
                data: {
                    state: user.state,
                },
            });
        }

        if (req.body?.client === "web" && Number(user.user_type) !== 2) {
            return sendError(res, req, {
                statusCode: 403,
                message:
                    "Tu usuario no tiene permisos de administrador para acceder a esta plataforma. Contacta a un administrador si crees que esto es un error.",
                data: { reason: "not_admin" },
            });
        }

        const token = jwt.sign(
            {
                sub: user.id,
                username: user.username,
                email: user.email,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d",
            },
        );

        return sendSuccess(res, req, {
            message: "Inicio de sesión completado exitosamente",
            data: {
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
            },
        });
    } catch (error) {
        next(error);
    }
});
app.get("/api/v1/auth/verify-email", async (req, res, next) => {
    try {
        const { token } = req.query;

        if (
            typeof token !== "string" ||
            token.length === 0
        ) {
            return res
                .status(400)
                .type("html")
                .send(
                    renderEmailVerificationPage({
                        success: false,
                        title: "Enlace inválido",
                        message:
                            "El enlace de verificación no es válido.",
                    }),
                );
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const result = await pool.query(
            `
                WITH valid_verification AS (
                    SELECT
                        ev.user_id
                    FROM public.email_verification ev
                    INNER JOIN public."user" u
                        ON u.id = ev.user_id
                    WHERE ev.token_hash = $1
                      AND ev.used_at IS NULL
                      AND ev.expires_at > NOW()
                      AND u.state = 'created'
                    FOR UPDATE
                ),
                activated_user AS (
                    UPDATE public."user" u
                    SET
                        state = 'active',
                        email_verified_at = NOW()
                    FROM valid_verification vv
                    WHERE u.id = vv.user_id
                    RETURNING u.id
                ),
                consumed_token AS (
                    UPDATE public.email_verification ev
                    SET used_at = NOW()
                    FROM activated_user au
                    WHERE ev.user_id = au.id
                    RETURNING ev.user_id
                )
                SELECT user_id
                FROM consumed_token;
            `,
            [tokenHash],
        );

        if (result.rowCount === 0) {
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
    } catch (error) {
        next(error);
    }
});
app.post("/api/v1/auth/resend-email-verification", async (req, res, next) => {
        const client = await pool.connect();

        try {
            const { email } = req.body ?? {};

            if (
                typeof email !== "string" ||
                email.trim().length === 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El correo electrónico es obligatorio.",
                });
            }

            const normalizedEmail = email.trim().toLowerCase();

            const userResult = await client.query(
                `
                    SELECT
                        id,
                        email,
                        state
                    FROM public."user"
                    WHERE LOWER(email) = $1
                    LIMIT 1;
                `,
                [normalizedEmail],
            );

            const user = userResult.rows[0];

            /*
             * Respuesta genérica para no revelar
             * si el correo existe o no existe.
             */
            if (!user || user.state !== "created") {
                return sendSuccess(res, req, {
                    message:
                        "Si la cuenta existe y requiere verificación, se ha enviado un correo electrónico.",
                });
            }

            await client.query("BEGIN");

            const rawToken = await createOrReplaceEmailVerification(
                client,
                user.id,
            );

            await client.query("COMMIT");

            try {
                await sendEmailVerificationEmail({
                    email: user.email,
                    rawToken,
                });
            } catch (emailError) {
                console.error(
                    "Resend verification email error:",
                    emailError,
                );
            }

            return sendSuccess(res, req, {
                message:
                    "Si la cuenta existe y requiere verificación, se ha enviado un correo electrónico.",
            });
        } catch (error) {
            await client.query("ROLLBACK");
            next(error);
        } finally {
            client.release();
        }
    },
);



/*
 * Protegido.
 *
 * Registra o reemplaza el Firebase Cloud Messaging token
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "fcmToken": "firebase-registration-token"
 * }
 */
app.put("/api/v1/users/me/fcm-token", authenticateToken, async (req, res, next) => {
        try {
            const { fcmToken } = req.body ?? {};

            if (
                typeof fcmToken !== "string" ||
                fcmToken.trim().length === 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El token de Firebase es obligatorio.",
                });
            }

            const normalizedFcmToken = fcmToken.trim();

            const query = `
                UPDATE public."user"
                SET fcm_token = $1
                WHERE id = $2
                RETURNING
                    id,
                    username,
                    email,
                    full_name,
                    cellphone;
            `;

            const result = await pool.query(query, [
                normalizedFcmToken,
                req.authenticatedUser.sub,
            ]);

            const user = result.rows[0];

            if (!user) {
                return sendError(res, req, {
                    statusCode: 404,
                    message: "El usuario autenticado no fue encontrado",
                });
            }

            return sendSuccess(res, req, {
                message: "Token de Firebase actualizado exitosamente",
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        fullName: user.full_name,
                        cellphone: user.cellphone,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    },
);
/*
 * Protegido.
 *
 * Elimina el Firebase Cloud Messaging token
 * del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
app.delete("/api/v1/users/me/fcm-token", authenticateToken, async (req, res, next) => {
        try {
            const query = `
                UPDATE public."user"
                SET fcm_token = NULL
                WHERE id = $1
                RETURNING
                    id,
                    username,
                    email,
                    full_name,
                    cellphone;
            `;

            const result = await pool.query(query, [
                req.authenticatedUser.sub,
            ]);

            const user = result.rows[0];

            if (!user) {
                return sendError(res, req, {
                    statusCode: 404,
                    message: "El usuario autenticado no fue encontrado",
                });
            }

            return sendSuccess(res, req, {
                message: "Token de Firebase eliminado exitosamente",
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        fullName: user.full_name,
                        cellphone: user.cellphone,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    },
);
app.get("/api/v1/products", authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.name,
                p.product_category_id AS "productCategoryId",
                pc.name AS "productCategoryName",
                p.price,
                p.image,
                p.description
            FROM public.product p
            INNER JOIN public.product_category pc
                ON pc.id = p.product_category_id
            ORDER BY p.id;
        `);

        return sendSuccess(res, req, {
            message: "Productos recuperados exitosamente",
            data: {
                products: result.rows,
            },
        });
    } catch (error) {
        next(error);
    }
});
app.get("/api/v1/promotions", authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.title,
                p.buy_quantity AS "buyQuantity",
                p.pay_quantity AS "payQuantity",
                p.discount_percentage AS "discountPercentage",
                p.promotion_category_id AS "promotionCategoryId",
                pc.name AS "promotionCategoryName",
                p.description,
                p.image,
                p.deadline
            FROM public.promotion p
            INNER JOIN public.promotion_category pc
                ON pc.id = p.promotion_category_id
            ORDER BY p.id;
        `);

        return sendSuccess(res, req, {
            message: "Promociones recuperadas exitosamente",
            data: {
                promotions: result.rows,
            },
        });
    } catch (error) {
        next(error);
    }
});
/*
 * Protegido.
 *
 * Registra una interacción del usuario autenticado con un producto.
 *
 * Si es la primera interacción del usuario con ese producto:
 * - crea el registro con interaction_count = 1.
 * - rating = rating recibido.
 *
 * Si el registro ya existe:
 * - recalcula el promedio de rating.
 * - incrementa interaction_count.
 * - actualiza last_interaction_at.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "productId": 12,
 *   "rating": 5
 * }
 */
app.post("/api/v1/products/interaction", authenticateToken, async (req, res, next) => {
        try {
            const { productId, rating } = req.body ?? {};

            if (
                !Number.isSafeInteger(productId) ||
                productId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El productId debe ser un entero positivo",
                });
            }

            if (
                typeof rating !== "number" ||
                !Number.isFinite(rating) ||
                rating < 1 ||
                rating > 5
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El rating debe ser un número entre 1 y 5",
                });
            }

            const userId = req.authenticatedUser.sub;

            const result = await pool.query(
                `
                    INSERT INTO public.user_product_interaction AS upi (
                        user_id,
                        product_id,
                        rating,
                        interaction_count,
                        last_interaction_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        1,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (user_id, product_id)
                    DO UPDATE SET
                        rating = ROUND(
                            (
                                (upi.rating * upi.interaction_count)
                                + EXCLUDED.rating
                            )
                            / (upi.interaction_count + 1),
                            2
                        ),
                        interaction_count = upi.interaction_count + 1,
                        last_interaction_at = CURRENT_TIMESTAMP
                    RETURNING
                        user_id AS "userId",
                        product_id AS "productId",
                        rating,
                        interaction_count AS "interactionCount",
                        last_interaction_at AS "lastInteractionAt";
                `,
                [
                    userId,
                    productId,
                    rating,
                ],
            );

            const interaction = result.rows[0];

            return sendSuccess(res, req, {
                statusCode: 201,
                message: "Interacción con el producto registrada exitosamente",
                data: {
                    interaction,
                },
            });
        } catch (error) {
            if (
                error.code === "23503" &&
                error.constraint === "fk_user_product_interaction_product"
            ) {
                return sendError(res, req, {
                    statusCode: 404,
                    message: "El producto no fue encontrado",
                });
            }

            if (
                error.code === "23503" &&
                error.constraint === "fk_user_product_interaction_user"
            ) {
                return sendError(res, req, {
                    statusCode: 401,
                    message: "El usuario autenticado no fue encontrado",
                });
            }

            next(error);
        }
    },
);
/*
 * Protegido.
 *
 * Registra una interacción del usuario autenticado con una promoción.
 *
 * Si es la primera interacción:
 * - crea el registro con interaction_count = 1.
 * - rating = rating recibido.
 *
 * Si ya existe la combinación user_id + promotion_id:
 * - recalcula el promedio de rating.
 * - incrementa interaction_count.
 * - actualiza last_interaction_at.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "promotionId": 12,
 *   "rating": 5
 * }
 */
app.post("/api/v1/promotions/interaction", authenticateToken, async (req, res, next) => {
        try {
            const { promotionId, rating } = req.body ?? {};

            if (
                !Number.isSafeInteger(promotionId) ||
                promotionId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El promotionId debe ser un entero positivo",
                });
            }

            if (
                typeof rating !== "number" ||
                !Number.isFinite(rating) ||
                rating < 1 ||
                rating > 5
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El rating debe ser un número entre 1 y 5",
                });
            }

            const userId = req.authenticatedUser.sub;

            const result = await pool.query(
                `
                    INSERT INTO public.user_promotion_interaction AS upi (
                        user_id,
                        promotion_id,
                        rating,
                        interaction_count,
                        last_interaction_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        1,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (user_id, promotion_id)
                    DO UPDATE SET
                        rating = ROUND(
                            (
                                (upi.rating * upi.interaction_count)
                                + EXCLUDED.rating
                            )
                            / (upi.interaction_count + 1),
                            2
                        ),
                        interaction_count = upi.interaction_count + 1,
                        last_interaction_at = CURRENT_TIMESTAMP
                    RETURNING
                        user_id AS "userId",
                        promotion_id AS "promotionId",
                        rating,
                        interaction_count AS "interactionCount",
                        last_interaction_at AS "lastInteractionAt";
                `,
                [
                    userId,
                    promotionId,
                    rating,
                ],
            );

            const interaction = result.rows[0];

            return sendSuccess(res, req, {
                statusCode: 201,
                message: "Interacción con la promoción registrada exitosamente",
                data: {
                    interaction,
                },
            });
        } catch (error) {
            if (error.code === "23503") {
                return sendError(res, req, {
                    statusCode: 404,
                    message:
                        "Promoción o usuario autenticado no fueron encontrados",
                });
            }

            next(error);
        }
    },
);



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
app.get("/api/v1/cart", authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authenticatedUser.sub;

        const cartResult = await pool.query(
            `
                SELECT
                    sc.id,
                    sc.created_at AS "createdAt",
                    sc.updated_at AS "updatedAt"
                FROM public.shopping_cart sc
                WHERE sc.user_id = $1
                LIMIT 1;
            `,
            [userId],
        );

        const cart = cartResult.rows[0];

        /*
         * El usuario aún no agregó nada al carrito.
         * No se crea un carrito vacío solo por consultarlo.
         */
        if (!cart) {
            return sendSuccess(res, req, {
                message: "Carrito recuperado exitosamente",
                data: {
                    cart: {
                        id: null,
                        createdAt: null,
                        updatedAt: null,
                        items: [],
                    },
                },
            });
        }

        const itemsResult = await pool.query(
            `
                SELECT
                    sci.id AS "cartItemId",
                    sci.quantity,
                    sci.created_at AS "createdAt",
                    sci.updated_at AS "updatedAt",

                    CASE
                        WHEN sci.product_id IS NOT NULL THEN 'product'
                        WHEN sci.promotion_id IS NOT NULL THEN 'promotion'
                    END AS "itemType",

                    p.id AS "productId",
                    p.name AS "productName",
                    p.product_category_id AS "productCategoryId",
                    pc.name AS "productCategoryName",
                    p.price AS "productPrice",
                    p.image AS "productImage",
                    p.description AS "productDescription",

                    pr.id AS "promotionId",
                    pr.title AS "promotionTitle",
                    pr.buy_quantity AS "buyQuantity",
                    pr.pay_quantity AS "payQuantity",
                    pr.discount_percentage AS "discountPercentage",
                    pr.promotion_category_id AS "promotionCategoryId",
                    prm.name AS "promotionCategoryName",
                    pr.description AS "promotionDescription",
                    pr.image AS "promotionImage",
                    pr.deadline AS "promotionDeadline",

                    CASE
                        WHEN pr.id IS NOT NULL
                            AND pr.deadline IS NOT NULL
                            AND pr.deadline < CURRENT_TIMESTAMP
                        THEN true
                        ELSE false
                    END AS "isPromotionExpired"

                FROM public.shopping_cart_item sci

                LEFT JOIN public.product p
                    ON p.id = sci.product_id

                LEFT JOIN public.product_category pc
                    ON pc.id = p.product_category_id

                LEFT JOIN public.promotion pr
                    ON pr.id = sci.promotion_id

                LEFT JOIN public.promotion_category prm
                    ON prm.id = pr.promotion_category_id

                WHERE sci.shopping_cart_id = $1
                ORDER BY sci.created_at DESC;
            `,
            [cart.id],
        );

        const items = itemsResult.rows.map((item) => {
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
        });

        return sendSuccess(res, req, {
            message: "Carrito recuperado exitosamente",
            data: {
                cart: {
                    id: cart.id,
                    createdAt: cart.createdAt,
                    updatedAt: cart.updatedAt,
                    items,
                },
            },
        });
    } catch (error) {
        next(error);
    }
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
app.post("/api/v1/cart/products", authenticateToken, async (req, res, next) => {
        const client = await pool.connect();

        try {
            const { productId, quantity } = req.body ?? {};

            if (
                !Number.isSafeInteger(productId) ||
                productId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El productId debe ser un entero positivo",
                });
            }

            if (
                !Number.isSafeInteger(quantity) ||
                quantity <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "La quantity debe ser un entero positivo",
                });
            }

            const userId = req.authenticatedUser.sub;

            await client.query("BEGIN");

            /*
             * Se valida primero para devolver 404 claro
             * y no depender de un error de foreign key.
             */
            const productResult = await client.query(
                `
                    SELECT
                        id,
                        name,
                        product_category_id AS "productCategoryId",
                        price,
                        image,
                        description
                    FROM public.product
                    WHERE id = $1
                    LIMIT 1;
                `,
                [productId],
            );

            const product = productResult.rows[0];

            if (!product) {
                await client.query("ROLLBACK");

                return sendError(res, req, {
                    statusCode: 404,
                    message: "El producto no fue encontrado",
                });
            }

            /*
             * Un carrito activo por usuario.
             */
            const cartResult = await client.query(
                `
                    INSERT INTO public.shopping_cart (
                        user_id,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (user_id)
                    DO UPDATE SET
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id;
                `,
                [userId],
            );

            const cart = cartResult.rows[0];

            /*
             * Si el producto ya existe dentro del carrito,
             * aumenta quantity. Si no existe, crea el ítem.
             *
             * Requiere el índice único parcial:
             * uq_shopping_cart_item_product
             */
            const cartItemResult = await client.query(
                `
                    INSERT INTO public.shopping_cart_item AS sci (
                        shopping_cart_id,
                        product_id,
                        quantity,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (shopping_cart_id, product_id)
                    WHERE product_id IS NOT NULL
                    DO UPDATE SET
                        quantity = sci.quantity + EXCLUDED.quantity,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING
                        id AS "cartItemId",
                        shopping_cart_id AS "shoppingCartId",
                        product_id AS "productId",
                        quantity,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt";
                `,
                [
                    cart.id,
                    productId,
                    quantity,
                ],
            );

            const cartItem = cartItemResult.rows[0];

            await client.query("COMMIT");

            return sendSuccess(res, req, {
                statusCode: 201,
                message: "Producto agregado al carrito exitosamente",
                data: {
                    cartItem: {
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
                    },
                },
            });
        } catch (error) {
            await client.query("ROLLBACK");
            next(error);
        } finally {
            client.release();
        }
    },
);
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
app.post("/api/v1/cart/promotions", authenticateToken, async (req, res, next) => {
        const client = await pool.connect();

        try {
            const { promotionId, quantity } = req.body ?? {};

            if (
                !Number.isSafeInteger(promotionId) ||
                promotionId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El promotionId debe ser un entero positivo",
                });
            }

            if (
                !Number.isSafeInteger(quantity) ||
                quantity <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "La quantity debe ser un entero positivo",
                });
            }

            const userId = req.authenticatedUser.sub;

            await client.query("BEGIN");

            /*
             * Se valida la existencia y vigencia de la promoción.
             * No se exige ninguna relación en promotion_product.
             */
            const promotionResult = await client.query(
                `
                    SELECT
                        p.id,
                        p.title,
                        p.buy_quantity AS "buyQuantity",
                        p.pay_quantity AS "payQuantity",
                        p.discount_percentage AS "discountPercentage",
                        p.promotion_category_id AS "promotionCategoryId",
                        pc.name AS "promotionCategoryName",
                        p.description,
                        p.image,
                        p.deadline
                    FROM public.promotion p
                    INNER JOIN public.promotion_category pc
                        ON pc.id = p.promotion_category_id
                    WHERE p.id = $1
                    LIMIT 1;
                `,
                [promotionId],
            );

            const promotion = promotionResult.rows[0];

            if (!promotion) {
                await client.query("ROLLBACK");

                return sendError(res, req, {
                    statusCode: 404,
                    message: "La promoción no fue encontrada",
                });
            }

            if (
                promotion.deadline !== null &&
                new Date(promotion.deadline) < new Date()
            ) {
                await client.query("ROLLBACK");

                return sendError(res, req, {
                    statusCode: 409,
                    message: "La promoción ya venció y no puede agregarse al carrito",
                });
            }

            /*
             * Crea el carrito si el usuario aún no tiene uno.
             */
            const cartResult = await client.query(
                `
                    INSERT INTO public.shopping_cart (
                        user_id,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (user_id)
                    DO UPDATE SET
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id;
                `,
                [userId],
            );

            const cart = cartResult.rows[0];

            /*
             * Si la promoción ya existe en el carrito,
             * incrementa quantity. Caso contrario, crea el ítem.
             *
             * Requiere el índice único parcial:
             * uq_shopping_cart_item_promotion
             */
            const cartItemResult = await client.query(
                `
                    INSERT INTO public.shopping_cart_item AS sci (
                        shopping_cart_id,
                        promotion_id,
                        quantity,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (shopping_cart_id, promotion_id)
                    WHERE promotion_id IS NOT NULL
                    DO UPDATE SET
                        quantity = sci.quantity + EXCLUDED.quantity,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING
                        id AS "cartItemId",
                        shopping_cart_id AS "shoppingCartId",
                        promotion_id AS "promotionId",
                        quantity,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt";
                `,
                [
                    cart.id,
                    promotionId,
                    quantity,
                ],
            );

            const cartItem = cartItemResult.rows[0];

            await client.query("COMMIT");

            return sendSuccess(res, req, {
                statusCode: 201,
                message: "Promoción agregada al carrito exitosamente",
                data: {
                    cartItem: {
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
                            promotionCategoryId:
                                promotion.promotionCategoryId,
                            promotionCategoryName:
                                promotion.promotionCategoryName,
                            description: promotion.description,
                            image: promotion.image,
                            deadline: promotion.deadline,
                        },
                    },
                },
            });
        } catch (error) {
            await client.query("ROLLBACK");
            next(error);
        } finally {
            client.release();
        }
    },
);
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
app.patch("/api/v1/cart/items/:cartItemId", authenticateToken, async (req, res, next) => {
        try {
            const cartItemId = Number(req.params.cartItemId);
            const { quantity } = req.body ?? {};
            const userId = req.authenticatedUser.sub;

            if (
                !Number.isSafeInteger(cartItemId) ||
                cartItemId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El cartItemId debe ser un entero positivo",
                });
            }

            if (
                !Number.isSafeInteger(quantity) ||
                quantity <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "La quantity debe ser un entero positivo",
                });
            }

            /*
             * Solo permite modificar ítems del carrito
             * perteneciente al usuario autenticado.
             */
            const result = await pool.query(
                `
                    UPDATE public.shopping_cart_item AS sci
                    SET
                        quantity = $1,
                        updated_at = CURRENT_TIMESTAMP
                    FROM public.shopping_cart AS sc
                    WHERE sci.id = $2
                      AND sci.shopping_cart_id = sc.id
                      AND sc.user_id = $3
                    RETURNING
                        sci.id AS "cartItemId",
                        sci.shopping_cart_id AS "shoppingCartId",
                        sci.product_id AS "productId",
                        sci.promotion_id AS "promotionId",
                        sci.quantity,
                        sci.created_at AS "createdAt",
                        sci.updated_at AS "updatedAt";
                `,
                [
                    quantity,
                    cartItemId,
                    userId,
                ],
            );

            const cartItem = result.rows[0];

            if (!cartItem) {
                return sendError(res, req, {
                    statusCode: 404,
                    message:
                        "El ítem del carrito no fue encontrado o no pertenece al usuario autenticado",
                });
            }

            const itemType =
                cartItem.productId !== null
                    ? "product"
                    : "promotion";

            return sendSuccess(res, req, {
                message:
                    "Cantidad del ítem del carrito actualizada exitosamente",
                data: {
                    cartItem: {
                        id: cartItem.cartItemId,
                        cartId: cartItem.shoppingCartId,
                        type: itemType,
                        productId: cartItem.productId,
                        promotionId: cartItem.promotionId,
                        quantity: cartItem.quantity,
                        createdAt: cartItem.createdAt,
                        updatedAt: cartItem.updatedAt,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    },
);
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
app.delete("/api/v1/cart/items/:cartItemId", authenticateToken, async (req, res, next) => {
        try {
            const cartItemId = Number(req.params.cartItemId);
            const userId = req.authenticatedUser.sub;

            if (
                !Number.isSafeInteger(cartItemId) ||
                cartItemId <= 0
            ) {
                return sendError(res, req, {
                    statusCode: 400,
                    message: "El cartItemId debe ser un entero positivo",
                });
            }

            /*
             * Solo elimina ítems que pertenezcan al carrito
             * del usuario autenticado.
             */
            const result = await pool.query(
                `
                    DELETE FROM public.shopping_cart_item AS sci
                    USING public.shopping_cart AS sc
                    WHERE sci.id = $1
                      AND sci.shopping_cart_id = sc.id
                      AND sc.user_id = $2
                    RETURNING
                        sci.id AS "cartItemId",
                        sci.shopping_cart_id AS "shoppingCartId",
                        sci.product_id AS "productId",
                        sci.promotion_id AS "promotionId",
                        sci.quantity,
                        sci.created_at AS "createdAt",
                        sci.updated_at AS "updatedAt";
                `,
                [
                    cartItemId,
                    userId,
                ],
            );

            const deletedCartItem = result.rows[0];

            if (!deletedCartItem) {
                return sendError(res, req, {
                    statusCode: 404,
                    message:
                        "El ítem del carrito no fue encontrado o no pertenece al usuario autenticado",
                });
            }

            const itemType =
                deletedCartItem.productId !== null
                    ? "product"
                    : "promotion";

            return sendSuccess(res, req, {
                message: "Ítem eliminado del carrito exitosamente",
                data: {
                    deletedCartItem: {
                        id: deletedCartItem.cartItemId,
                        cartId: deletedCartItem.shoppingCartId,
                        type: itemType,
                        productId: deletedCartItem.productId,
                        promotionId: deletedCartItem.promotionId,
                        quantity: deletedCartItem.quantity,
                        createdAt: deletedCartItem.createdAt,
                        updatedAt: deletedCartItem.updatedAt,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    },
);
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
app.delete("/api/v1/cart", authenticateToken, async (req, res, next) => {
        try {
            const userId = req.authenticatedUser.sub;

            const result = await pool.query(
                `
                    DELETE FROM public.shopping_cart_item AS sci
                    USING public.shopping_cart AS sc
                    WHERE sci.shopping_cart_id = sc.id
                      AND sc.user_id = $1
                    RETURNING sci.id;
                `,
                [userId],
            );

            /*
             * Se actualiza updated_at solo si el carrito existe.
             * Aunque no tuviera ítems, sigue siendo una operación válida.
             */
            await pool.query(
                `
                    UPDATE public.shopping_cart
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1;
                `,
                [userId],
            );

            return sendSuccess(res, req, {
                message: "Carrito vaciado exitosamente",
                data: {
                    deletedItemsCount: result.rowCount,
                },
            });
        } catch (error) {
            next(error);
        }
    },
);



/*
 * Filtrado/paginado compartido por los endpoints de listado de interacciones
 * (products/interaction/all, promotions/interaction/all).
 *
 * Valida los query params y responde el error 400 correspondiente si alguno
 * es inválido. Devuelve `null` cuando ya se envió una respuesta de error
 * (el caller debe simplemente `return` en ese caso) o el objeto de filtros
 * ya parseado/normalizado en caso contrario.
 */
const INTERACTION_TEXT_FILTER_REGEX = /^[\p{L}0-9 ._-]{0,100}$/u;
const INTERACTION_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INTERACTION_PAGE_SIZES = [15, 30, 45];

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

/*
 * Público.
 *
 * Recupera las interacciones entre usuarios y productos, paginadas y con
 * filtros opcionales por usuario, producto y rango de fechas
 * (últimaInteracción).
 *
 * Devuelve los datos de user_product_interaction,
 * junto con el username del usuario y el nombre del producto.
 *
 * No requiere autenticación.
 */
app.get("/api/v1/products/interaction/all", async (req, res, next) => {
    try {
        const filters = parseInteractionListQuery(req, res, {
            entityParam: "productName",
        });
        if (!filters) {
            return;
        }

        const conditions = [];
        const params = [];

        if (filters.username) {
            params.push(`%${filters.username}%`);
            conditions.push(`u.username ILIKE $${params.length}`);
        }
        if (filters.entityValue) {
            params.push(`%${filters.entityValue}%`);
            conditions.push(`p.name ILIKE $${params.length}`);
        }
        if (filters.dateFrom) {
            params.push(filters.dateFrom);
            conditions.push(`upi.last_interaction_at >= $${params.length}::date`);
        }
        if (filters.dateTo) {
            params.push(filters.dateTo);
            conditions.push(
                `upi.last_interaction_at < ($${params.length}::date + INTERVAL '1 day')`,
            );
        }

        const whereClause =
            conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        params.push(filters.pageSize);
        const limitParamIndex = params.length;
        params.push((filters.page - 1) * filters.pageSize);
        const offsetParamIndex = params.length;

        const result = await pool.query(
            `
                SELECT
                    upi.user_id AS "userId",
                    u.username AS "username",
                    upi.product_id AS "productId",
                    p.name AS "productName",
                    upi.rating,
                    upi.interaction_count AS "interactionCount",
                    upi.last_interaction_at AS "lastInteractionAt",
                    COUNT(*) OVER() AS "totalItems"
                FROM public.user_product_interaction upi
                INNER JOIN public."user" u
                    ON u.id = upi.user_id
                INNER JOIN public.product p
                    ON p.id = upi.product_id
                ${whereClause}
                ORDER BY
                    upi.last_interaction_at DESC,
                    upi.user_id ASC,
                    upi.product_id ASC
                LIMIT $${limitParamIndex}
                OFFSET $${offsetParamIndex};
            `,
            params,
        );

        const totalItems =
            result.rows.length > 0 ? Number(result.rows[0].totalItems) : 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
        const interactions = result.rows.map(
            ({ totalItems: _totalItems, ...row }) => row,
        );

        return sendSuccess(res, req, {
            message: "Interacciones con productos recuperadas exitosamente",
            data: {
                interactions,
                pagination: {
                    page: filters.page,
                    pageSize: filters.pageSize,
                    totalItems,
                    totalPages,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});
/*
 * Público.
 *
 * Recupera las interacciones entre usuarios y promociones, paginadas y con
 * filtros opcionales por usuario, promoción y rango de fechas
 * (últimaInteracción).
 *
 * Devuelve los datos de user_promotion_interaction,
 * junto con el username del usuario y el título de la promoción.
 *
 * No requiere autenticación.
 */
app.get("/api/v1/promotions/interaction/all", async (req, res, next) => {
    try {
        const filters = parseInteractionListQuery(req, res, {
            entityParam: "promotionTitle",
        });
        if (!filters) {
            return;
        }

        const conditions = [];
        const params = [];

        if (filters.username) {
            params.push(`%${filters.username}%`);
            conditions.push(`u.username ILIKE $${params.length}`);
        }
        if (filters.entityValue) {
            params.push(`%${filters.entityValue}%`);
            conditions.push(`p.title ILIKE $${params.length}`);
        }
        if (filters.dateFrom) {
            params.push(filters.dateFrom);
            conditions.push(`upi.last_interaction_at >= $${params.length}::date`);
        }
        if (filters.dateTo) {
            params.push(filters.dateTo);
            conditions.push(
                `upi.last_interaction_at < ($${params.length}::date + INTERVAL '1 day')`,
            );
        }

        const whereClause =
            conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        params.push(filters.pageSize);
        const limitParamIndex = params.length;
        params.push((filters.page - 1) * filters.pageSize);
        const offsetParamIndex = params.length;

        const result = await pool.query(
            `
                SELECT
                    upi.user_id AS "userId",
                    u.username AS "username",
                    upi.promotion_id AS "promotionId",
                    p.title AS "promotionTitle",
                    upi.rating,
                    upi.interaction_count AS "interactionCount",
                    upi.last_interaction_at AS "lastInteractionAt",
                    COUNT(*) OVER() AS "totalItems"
                FROM public.user_promotion_interaction upi
                INNER JOIN public."user" u
                    ON u.id = upi.user_id
                INNER JOIN public.promotion p
                    ON p.id = upi.promotion_id
                ${whereClause}
                ORDER BY
                    upi.last_interaction_at DESC,
                    upi.user_id ASC,
                    upi.promotion_id ASC
                LIMIT $${limitParamIndex}
                OFFSET $${offsetParamIndex};
            `,
            params,
        );

        const totalItems =
            result.rows.length > 0 ? Number(result.rows[0].totalItems) : 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / filters.pageSize));
        const interactions = result.rows.map(
            ({ totalItems: _totalItems, ...row }) => row,
        );

        return sendSuccess(res, req, {
            message: "Interacciones con promociones recuperadas exitosamente",
            data: {
                interactions,
                pagination: {
                    page: filters.page,
                    pageSize: filters.pageSize,
                    totalItems,
                    totalPages,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});



/*
 *
 * Ejecuta manualmente el entrenamiento de filtrado colaborativo.
 * 
 */
app.post("/api/v1/recommendations/train", async (req, res, next) => {
    try {
        const result = await trainCollaborativeFiltering();

        return sendSuccess(res, req, {
            message: result.skipped
                ? "El entrenamiento fue omitido porque ya hay uno en ejecución"
                : "Entrenamiento de recomendaciones ejecutado exitosamente",
            data: result,
        });
    } catch (error) {
        next(error);
    }
});



/*
 * Protegido.
 *
 * Devuelve las métricas agregadas de fan engagement usadas por el
 * dashboard: KPIs generales, actividad reciente (30 días), rankings
 * top-5 de productos y promociones, salud del recomendador de
 * filtrado colaborativo y el embudo interacción -> carrito.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
app.get("/api/v1/dashboard/engagement", authenticateToken, async (req, res, next) => {
    try {
        const [
            registeredFansResult,
            activeFansResult,
            productInteractionTotalsResult,
            promotionInteractionTotalsResult,
            activityResult,
            topProductsResult,
            topPromotionsResult,
            recommenderResult,
            funnelResult,
        ] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS count FROM public."user";`),
            pool.query(`
                SELECT COUNT(DISTINCT user_id) AS count
                FROM (
                    SELECT user_id FROM public.user_product_interaction
                    UNION
                    SELECT user_id FROM public.user_promotion_interaction
                ) active_fan;
            `),
            pool.query(`
                SELECT
                    COALESCE(SUM(interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(rating), 0) AS average_rating
                FROM public.user_product_interaction;
            `),
            pool.query(`
                SELECT
                    COALESCE(SUM(interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(rating), 0) AS average_rating
                FROM public.user_promotion_interaction;
            `),
            pool.query(`
                WITH day_series AS (
                    SELECT generate_series(
                        CURRENT_DATE - INTERVAL '29 days',
                        CURRENT_DATE,
                        '1 day'
                    )::date AS day
                ),
                daily_activity AS (
                    SELECT
                        date_trunc('day', last_interaction_at)::date AS day,
                        user_id,
                        interaction_count
                    FROM public.user_product_interaction
                    UNION ALL
                    SELECT
                        date_trunc('day', last_interaction_at)::date AS day,
                        user_id,
                        interaction_count
                    FROM public.user_promotion_interaction
                )
                SELECT
                    ds.day,
                    COALESCE(COUNT(DISTINCT da.user_id), 0) AS active_fans,
                    COALESCE(SUM(da.interaction_count), 0) AS interactions
                FROM day_series ds
                LEFT JOIN daily_activity da
                    ON da.day = ds.day
                GROUP BY ds.day
                ORDER BY ds.day ASC;
            `),
            pool.query(`
                SELECT
                    p.id,
                    p.name,
                    pc.name AS category_name,
                    COUNT(DISTINCT upi.user_id) AS unique_fans,
                    COALESCE(SUM(upi.interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(upi.rating), 0) AS average_rating
                FROM public.user_product_interaction upi
                INNER JOIN public.product p
                    ON p.id = upi.product_id
                INNER JOIN public.product_category pc
                    ON pc.id = p.product_category_id
                GROUP BY p.id, p.name, pc.name
                ORDER BY total_interactions DESC, average_rating DESC
                LIMIT 5;
            `),
            pool.query(`
                SELECT
                    pr.id,
                    pr.title,
                    prc.name AS category_name,
                    COUNT(DISTINCT upi.user_id) AS unique_fans,
                    COALESCE(SUM(upi.interaction_count), 0) AS total_interactions,
                    COALESCE(AVG(upi.rating), 0) AS average_rating
                FROM public.user_promotion_interaction upi
                INNER JOIN public.promotion pr
                    ON pr.id = upi.promotion_id
                INNER JOIN public.promotion_category prc
                    ON prc.id = pr.promotion_category_id
                GROUP BY pr.id, pr.title, prc.name
                ORDER BY total_interactions DESC, average_rating DESC
                LIMIT 5;
            `),
            pool.query(`
                SELECT
                    (SELECT COUNT(DISTINCT user_id) FROM public.user_product_recommendation) AS fans_with_product_recommendations,
                    (SELECT COUNT(DISTINCT user_id) FROM public.user_promotion_recommendation) AS fans_with_promotion_recommendations,
                    (SELECT COUNT(*) FROM public.user_product_recommendation) AS product_recommendation_count,
                    (SELECT COUNT(*) FROM public.user_promotion_recommendation) AS promotion_recommendation_count,
                    (SELECT MAX(generated_at) FROM public.user_product_recommendation) AS product_last_trained_at,
                    (SELECT MAX(generated_at) FROM public.user_promotion_recommendation) AS promotion_last_trained_at;
            `),
            pool.query(`
                SELECT
                    (
                        SELECT COUNT(DISTINCT user_id) FROM (
                            SELECT user_id FROM public.user_product_interaction
                            UNION
                            SELECT user_id FROM public.user_promotion_interaction
                        ) active_fan
                    ) AS fans_with_interaction,
                    (
                        SELECT COUNT(DISTINCT sc.user_id)
                        FROM public.shopping_cart sc
                        INNER JOIN public.shopping_cart_item sci
                            ON sci.shopping_cart_id = sc.id
                    ) AS fans_with_cart,
                    COALESCE(
                        (SELECT SUM(sci.quantity) FROM public.shopping_cart_item sci),
                        0
                    ) AS cart_items;
            `),
        ]);

        const registeredFans = Number(registeredFansResult.rows[0].count);
        const activeFans = Number(activeFansResult.rows[0].count);

        const productInteractions = Number(
            productInteractionTotalsResult.rows[0].total_interactions,
        );
        const promotionInteractions = Number(
            promotionInteractionTotalsResult.rows[0].total_interactions,
        );
        const totalInteractions = productInteractions + promotionInteractions;

        const activationRate = registeredFans > 0
            ? activeFans / registeredFans
            : 0;
        const averageInteractionsPerActiveFan = activeFans > 0
            ? totalInteractions / activeFans
            : 0;

        const activityDays = activityResult.rows.map((row) => ({
            date: row.day.toISOString().slice(0, 10),
            activeFans: Number(row.active_fans),
            interactions: Number(row.interactions),
        }));

        const topProducts = topProductsResult.rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            categoryName: row.category_name,
            uniqueFans: Number(row.unique_fans),
            totalInteractions: Number(row.total_interactions),
            averageRating: Number(row.average_rating),
        }));

        const topPromotions = topPromotionsResult.rows.map((row) => ({
            id: Number(row.id),
            title: row.title,
            categoryName: row.category_name,
            uniqueFans: Number(row.unique_fans),
            totalInteractions: Number(row.total_interactions),
            averageRating: Number(row.average_rating),
        }));

        const recommenderRow = recommenderResult.rows[0];
        const fansWithProductRecommendations = Number(
            recommenderRow.fans_with_product_recommendations,
        );
        const coverageRate = activeFans > 0
            ? fansWithProductRecommendations / activeFans
            : 0;
        const lastTrainedAt = [
            recommenderRow.product_last_trained_at,
            recommenderRow.promotion_last_trained_at,
        ]
            .filter((value) => value !== null)
            .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;

        const funnelRow = funnelResult.rows[0];
        const fansWithInteraction = Number(funnelRow.fans_with_interaction);
        const fansWithCart = Number(funnelRow.fans_with_cart);
        const interactionToCartRate = fansWithInteraction > 0
            ? fansWithCart / fansWithInteraction
            : 0;

        return sendSuccess(res, req, {
            message: "Métricas de fan engagement recuperadas exitosamente",
            data: {
                generatedAt: new Date().toISOString(),
                kpis: {
                    registeredFans,
                    activeFans,
                    activationRate,
                    productInteractions,
                    promotionInteractions,
                    totalInteractions,
                    averageInteractionsPerActiveFan,
                    averageProductRating: Number(
                        productInteractionTotalsResult.rows[0].average_rating,
                    ),
                    averagePromotionRating: Number(
                        promotionInteractionTotalsResult.rows[0].average_rating,
                    ),
                },
                activity: {
                    days: activityDays,
                },
                topProducts,
                topPromotions,
                recommender: {
                    fansWithProductRecommendations,
                    fansWithPromotionRecommendations: Number(
                        recommenderRow.fans_with_promotion_recommendations,
                    ),
                    productRecommendationCount: Number(
                        recommenderRow.product_recommendation_count,
                    ),
                    promotionRecommendationCount: Number(
                        recommenderRow.promotion_recommendation_count,
                    ),
                    coverageRate,
                    lastTrainedAt,
                },
                funnel: {
                    fansWithInteraction,
                    fansWithCart,
                    cartItems: Number(funnelRow.cart_items),
                    interactionToCartRate,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});



/*
 * Protegido.
 *
 * Devuelve las recomendaciones de productos del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
app.get("/api/v1/products/recommendations", authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authenticatedUser.sub;

        const result = await pool.query(
            `
                SELECT
                    p.id,
                    p.name,
                    p.product_category_id AS "productCategoryId",
                    pc.name AS "productCategoryName",
                    p.price,
                    p.image,
                    p.description,
                    upr.recommendation_score AS "recommendationScore",
                    upr.generated_at AS "generatedAt"
                FROM public.user_product_recommendation upr
                INNER JOIN public.product p
                    ON p.id = upr.product_id
                INNER JOIN public.product_category pc
                    ON pc.id = p.product_category_id
                WHERE upr.user_id = $1
                ORDER BY
                    upr.recommendation_score DESC,
                    p.id ASC
                LIMIT 30;
            `,
            [userId],
        );

        return sendSuccess(res, req, {
            message: "Recomendaciones de productos obtenidas exitosamente",
            data: {
                products: result.rows,
            },
        });
    } catch (error) {
        next(error);
    }
});
/*
 * Protegido.
 *
 * Devuelve las recomendaciones de promociones del usuario autenticado.
 *
 * Header:
 * Authorization: Bearer <accessToken>
 */
app.get("/api/v1/promotions/recommendations", authenticateToken, async (req, res, next) => {
    try {
        const userId = req.authenticatedUser.sub;

        const result = await pool.query(
            `
                SELECT
                    pr.id,
                    pr.title,
                    pr.buy_quantity AS "buyQuantity",
                    pr.pay_quantity AS "payQuantity",
                    pr.discount_percentage AS "discountPercentage",
                    pr.promotion_category_id AS "promotionCategoryId",
                    pc.name AS "promotionCategoryName",
                    pr.description,
                    pr.image,
                    upr.recommendation_score AS "recommendationScore",
                    upr.generated_at AS "generatedAt"
                FROM public.user_promotion_recommendation upr
                INNER JOIN public.promotion pr
                    ON pr.id = upr.promotion_id
                INNER JOIN public.promotion_category pc
                    ON pc.id = pr.promotion_category_id
                WHERE upr.user_id = $1
                ORDER BY
                    upr.recommendation_score DESC,
                    pr.id ASC
                LIMIT 30;
            `,
            [userId],
        );

        return sendSuccess(res, req, {
            message: "Recomendaciones de promociones obtenidas exitosamente",
            data: {
                promotions: result.rows,
            },
        });
    } catch (error) {
        next(error);
    }
});



/*
 * Ruta no encontrada.
 */
app.use((req, res) => {
    return sendError(res, req, {
        statusCode: 404,
        message: "Ruta no encontrada",
        data: {
            path: req.originalUrl,
        },
    });
});
/*
 * Errores inesperados.
 */
app.use((error, req, res, next) => {
    console.error(error);

    return sendError(res, req, {
        statusCode: 500,
        message: "Error interno del servidor",
    });
});



app.listen(port, host, () => {
    console.log(`Server running on port ${port}`);

    startCollaborativeFilteringTrainingScheduler();
});