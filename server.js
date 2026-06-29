require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

const app = express();

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

app.use(express.json());



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
        message = "Request completed successfully",
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
        message = "An unexpected error occurred",
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
            message: "Authentication token is required",
        });
    }

    const token = authorization.substring("Bearer ".length);

    try {
        req.authenticatedUser = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return sendError(res, req, {
            statusCode: 401,
            message: "Invalid or expired authentication token",
        });
    }
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
            message: "API and database are running correctly",
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
                    "username, email, password, fullName and cellphone are required",
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
                    "username must contain 3 to 30 lowercase letters, numbers or underscores",
            });
        }

        if (
            normalizedEmail.length === 0 ||
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message: "email is invalid",
            });
        }

        if (password.length < 8) {
            return sendError(res, req, {
                statusCode: 400,
                message: "password must contain at least 8 characters",
            });
        }

        if (
            normalizedFullName.length === 0 ||
            normalizedFullName.length > 300
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message: "fullName must contain between 1 and 300 characters",
            });
        }

        if (
            !/^\+?[0-9]{7,15}$/.test(normalizedCellphone) ||
            normalizedCellphone.length > 16
        ) {
            return sendError(res, req, {
                statusCode: 400,
                message:
                    "cellphone must contain 7 to 15 digits and may start with +",
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
                    "Account was created, but the verification email could not be sent. Request a new verification email.",
            });
        }

        return sendSuccess(res, req, {
            statusCode: 201,
            message:
                "User registered successfully. Verify your email before logging in.",
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
                message: `${duplicatedField} is already registered`,
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
                message: "identifier and password are required",
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
                state
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
                message: "Invalid credentials",
            });
        }

        const passwordIsValid = await argon2.verify(
            user.password_hash,
            password,
        );

        if (!passwordIsValid) {
            return sendError(res, req, {
                statusCode: 401,
                message: "Invalid credentials",
            });
        }

        if (user.state !== "active") {
            return sendError(res, req, {
                statusCode: 403,
                message:
                    "Email verification is required before logging in",
                data: {
                    state: user.state,
                },
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
            message: "Login completed successfully",
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
                    message: "email is required",
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
                        "If the account exists and requires verification, an email has been sent.",
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
                    "If the account exists and requires verification, an email has been sent.",
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
                    message: "fcmToken is required",
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
                    message: "Authenticated user was not found",
                });
            }

            return sendSuccess(res, req, {
                message: "Firebase token updated successfully",
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
                    message: "Authenticated user was not found",
                });
            }

            return sendSuccess(res, req, {
                message: "Firebase token deleted successfully",
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
            message: "Products retrieved successfully",
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
            message: "Promotions retrieved successfully",
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
                    message: "productId must be a positive integer",
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
                    message: "rating must be a number between 1 and 5",
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
                message: "Product interaction registered successfully",
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
                    message: "Product was not found",
                });
            }

            if (
                error.code === "23503" &&
                error.constraint === "fk_user_product_interaction_user"
            ) {
                return sendError(res, req, {
                    statusCode: 401,
                    message: "Authenticated user was not found",
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
                    message: "promotionId must be a positive integer",
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
                    message: "rating must be a number between 1 and 5",
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
                message: "Promotion interaction registered successfully",
                data: {
                    interaction,
                },
            });
        } catch (error) {
            if (error.code === "23503") {
                return sendError(res, req, {
                    statusCode: 404,
                    message:
                        "Promotion or authenticated user was not found",
                });
            }

            next(error);
        }
    },
);



/*
 * Ruta no encontrada.
 */
app.use((req, res) => {
    return sendError(res, req, {
        statusCode: 404,
        message: "Route not found",
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
        message: "Internal server error",
    });
});



app.listen(port, host, () => {
    console.log(`Server running on port ${port}`);
});