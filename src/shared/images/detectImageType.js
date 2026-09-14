function matchesSignature(buffer, signature, offset = 0) {
    if (buffer.length < offset + signature.length) {
        return false;
    }

    for (let i = 0; i < signature.length; i += 1) {
        if (buffer[offset + i] !== signature[i]) {
            return false;
        }
    }

    return true;
}

/*
 * Detecta el tipo real de imagen por sus magic bytes, ignorando la extensión
 * del archivo o el Content-Type declarado por el cliente (spam/spoofing).
 */
function detectRealImageType(buffer) {
    if (matchesSignature(buffer, [0xff, 0xd8, 0xff])) {
        return { extension: "jpg", mimeType: "image/jpeg" };
    }

    if (
        matchesSignature(
            buffer,
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        )
    ) {
        return { extension: "png", mimeType: "image/png" };
    }

    if (matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38])) {
        return { extension: "gif", mimeType: "image/gif" };
    }

    if (
        matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) &&
        matchesSignature(buffer, [0x57, 0x45, 0x42, 0x50], 8)
    ) {
        return { extension: "webp", mimeType: "image/webp" };
    }

    return null;
}

module.exports = { detectRealImageType };
