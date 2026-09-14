const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../../config/s3Client");
const env = require("../../config/env");

const SIGNATURE_TTL_SECONDS = 7 * 24 * 60 * 60;
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const cache = new Map();

async function signObjectKey(objectKey) {
    const command = new GetObjectCommand({
        Bucket: env.bucket,
        Key: objectKey,
    });

    const url = await getSignedUrl(s3Client, command, {
        expiresIn: SIGNATURE_TTL_SECONDS,
    });

    cache.set(objectKey, {
        url,
        expiresAt: Date.now() + SIGNATURE_TTL_SECONDS * 1000,
    });

    return url;
}

/*
 * Convención de almacenamiento (spec 20): si el valor empieza con "http" es una
 * URL externa heredada y se devuelve tal cual; cualquier otro valor se trata
 * como object_key del bucket y se prefirma, cacheando la firma en memoria de
 * proceso y renovándola quietamente cuando le quedan <24h de vida (la firma
 * dura 7 días).
 */
async function resolveImageUrl(value) {
    if (!value) {
        return value;
    }

    if (value.startsWith("http")) {
        return value;
    }

    const cached = cache.get(value);

    if (cached && cached.expiresAt - Date.now() > RENEW_THRESHOLD_MS) {
        return cached.url;
    }

    return signObjectKey(value);
}

module.exports = { resolveImageUrl };
