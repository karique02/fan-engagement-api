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

module.exports = { listImages };
