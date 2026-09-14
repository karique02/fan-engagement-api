const crypto = require("crypto");
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const pool = require("../../config/database");
const env = require("../../config/env");
const s3Client = require("../../config/s3Client");
const AppError = require("../../shared/errors/AppError");
const { detectRealImageType } = require("../../shared/images/detectImageType");
const { resolveImageUrl } = require("../../shared/images/presignedUrlCache");
const repository = require("./images.repository");

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

async function listImages() {
    const images = await repository.listImages(pool);

    return Promise.all(
        images.map(async (image) => ({
            id: image.id,
            sourceType: image.sourceType,
            sourceId: image.sourceId,
            objectKey: image.objectKey ?? null,
            url: await resolveImageUrl(image.objectKey ?? image.url),
        })),
    );
}

async function uploadImage(file) {
    if (!file) {
        throw new AppError(400, "Debes adjuntar un archivo de imagen");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new AppError(400, "El archivo supera el límite de 5MB permitido");
    }

    const detected = detectRealImageType(file.buffer);

    if (!detected) {
        throw new AppError(
            400,
            "El archivo no es una imagen válida (jpg, png, gif o webp)",
        );
    }

    const objectKey = `catalog/${crypto.randomUUID()}.${detected.extension}`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: env.bucket,
            Key: objectKey,
            Body: file.buffer,
            ContentType: detected.mimeType,
        }),
    );

    const image = await repository.insertImage(pool, {
        url: objectKey,
        sourceType: "upload",
        objectKey,
    });

    const url = await resolveImageUrl(objectKey);

    return { id: image.id, url, objectKey };
}

async function getImageUsage(id) {
    const image = await repository.findImageById(pool, id);

    if (!image) {
        throw new AppError(404, "Imagen no encontrada");
    }

    return repository.findImageUsage(pool, image.objectKey ?? image.url);
}

async function deleteImage(id) {
    const image = await repository.findImageById(pool, id);

    if (!image) {
        throw new AppError(404, "Imagen no encontrada");
    }

    if (image.objectKey) {
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: env.bucket,
                Key: image.objectKey,
            }),
        );
    }

    await repository.deleteImageById(pool, id);
}

module.exports = { listImages, uploadImage, getImageUsage, deleteImage };
