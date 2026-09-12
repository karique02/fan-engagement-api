require("dotenv").config();

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

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required");
}

module.exports = {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    apiPublicUrl: process.env.API_PUBLIC_URL,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM,
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    nodeEnv: process.env.NODE_ENV,
};
