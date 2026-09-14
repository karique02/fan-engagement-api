/*
 * Migra las imágenes heredadas (URLs externas) de product/promotion/member_promotion
 * al bucket de Railway, reemplazando la columna `image` de cada fila por el
 * object_key resultante. Idempotente: solo procesa filas cuyo `image` todavía
 * empieza con "http"; una fila ya migrada (object_key) se salta en un reintento.
 * No aborta ante un fallo puntual (URL externa caída/timeout) — lo registra y
 * sigue con el resto.
 */
require("../src/config/env");
const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const pool = require("../src/config/database");
const env = require("../src/config/env");
const s3Client = require("../src/config/s3Client");
const { detectRealImageType } = require("../src/shared/images/detectImageType");

const TABLES = [
    { table: "product", titleColumn: "name" },
    { table: "promotion", titleColumn: "title" },
    { table: "member_promotion", titleColumn: "title" },
];

async function migrateRow(table, row) {
    const response = await fetch(row.image);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} al descargar ${row.image}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const detected = detectRealImageType(buffer);

    if (!detected) {
        throw new Error(`Contenido no reconocido como imagen: ${row.image}`);
    }

    const objectKey = `catalog/${crypto.randomUUID()}.${detected.extension}`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: env.bucket,
            Key: objectKey,
            Body: buffer,
            ContentType: detected.mimeType,
        }),
    );

    await pool.query(`UPDATE public.${table} SET image = $1 WHERE id = $2;`, [
        objectKey,
        row.id,
    ]);

    return objectKey;
}

async function migrateTable(table, titleColumn) {
    const result = await pool.query(
        `SELECT id, ${titleColumn} AS title, image FROM public.${table} WHERE image LIKE 'http%';`,
    );

    let migrated = 0;
    let failed = 0;

    for (const row of result.rows) {
        try {
            const objectKey = await migrateRow(table, row);
            migrated += 1;
            console.log(`[${table}#${row.id}] "${row.title}" -> ${objectKey}`);
        } catch (error) {
            failed += 1;
            console.error(
                `[${table}#${row.id}] "${row.title}" FALLÓ: ${error.message}`,
            );
        }
    }

    return { table, total: result.rows.length, migrated, failed };
}

async function run() {
    const summaries = [];

    for (const { table, titleColumn } of TABLES) {
        summaries.push(await migrateTable(table, titleColumn));
    }

    console.log("\nResumen:");
    for (const summary of summaries) {
        console.log(
            `  ${summary.table}: ${summary.migrated}/${summary.total} migradas, ${summary.failed} fallidas`,
        );
    }

    await pool.end();
}

run().catch((error) => {
    console.error("Error fatal en la migración:", error);
    process.exit(1);
});
