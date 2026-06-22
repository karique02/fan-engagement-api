require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");

const app = express();

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
}

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
});

app.use(express.json());

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
 * Permite iniciar sesión con username o email.
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
        const { identifier, password } = req.body;

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
                password_hash
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
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

app.get("/api/v1/products", authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM public.product
            ORDER BY id;
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