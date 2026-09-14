const { sendSuccess } = require("../../shared/http/response");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./images.service");

const listImages = asyncHandler(async (req, res) => {
    const images = await service.listImages();

    return sendSuccess(res, req, {
        message: "Imagenes recuperadas exitosamente",
        data: { images },
    });
});

const uploadImage = asyncHandler(async (req, res) => {
    const data = await service.uploadImage(req.file);

    return sendSuccess(res, req, {
        statusCode: 201,
        message: "Imagen subida exitosamente",
        data,
    });
});

const getImageUsage = asyncHandler(async (req, res) => {
    const data = await service.getImageUsage(req.params.id);

    return sendSuccess(res, req, {
        message: "Uso de la imagen recuperado exitosamente",
        data,
    });
});

const deleteImage = asyncHandler(async (req, res) => {
    await service.deleteImage(req.params.id);

    return sendSuccess(res, req, {
        message: "Imagen eliminada exitosamente",
    });
});

module.exports = { listImages, uploadImage, getImageUsage, deleteImage };
