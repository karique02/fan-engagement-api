const multer = require("multer");
const AppError = require("../../shared/errors/AppError");

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

function uploadSingleImage(req, res, next) {
    upload.single("file")(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                return next(
                    new AppError(
                        400,
                        "El archivo supera el límite de 5MB permitido",
                    ),
                );
            }

            return next(
                new AppError(400, "No se pudo procesar el archivo enviado"),
            );
        }

        if (error) {
            return next(error);
        }

        next();
    });
}

module.exports = uploadSingleImage;
