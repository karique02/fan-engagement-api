class AppError extends Error {
    constructor(statusCode, message, data = null) {
        super(message);
        this.statusCode = statusCode;
        this.data = data;
    }
}

module.exports = AppError;
