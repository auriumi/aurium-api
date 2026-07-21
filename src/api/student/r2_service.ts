import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import prisma from "../../config/prisma";

const DEFAULT_BUCKET = "aurium";
const BUCKET = (process.env.R2_BUCKET || DEFAULT_BUCKET).trim();
const R2_CONFIG_ERROR = "R2_STORAGE_NOT_CONFIGURED";
const INVALID_IMAGE_ERROR = "INVALID_IMAGE_UPLOAD";

const ALLOWED_IMAGE_MIME: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
};

const PUBLIC_HOST_ENV_KEYS = [
    "R2_PUBLIC_HOST",
    "R2_PUBLIC_DOMAIN",
    "R2_CDN_HOST",
];

let s3Client: S3Client | null = null;
let s3ClientCacheKey = "";

export function isR2ConfigurationError(err: unknown) {
    return err instanceof Error && err.message === R2_CONFIG_ERROR;
}

export function isInvalidImageUploadError(err: unknown) {
    return err instanceof Error && err.message === INVALID_IMAGE_ERROR;
}

function getR2Config() {
    const accountId = process.env.R2_ACC_ID?.trim();
    const accessKeyId = process.env.R2_ACC_KEY?.trim();
    const secretAccessKey = process.env.R2_SECRET_KEY?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey || !BUCKET) {
        throw new Error(R2_CONFIG_ERROR);
    }

    return {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket: BUCKET,
    };
}

function getS3Client() {
    const config = getR2Config();
    const cacheKey = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;

    if (!s3Client || s3ClientCacheKey !== cacheKey) {
        s3Client = new S3Client({
            region: "auto",
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        s3ClientCacheKey = cacheKey;
    }

    return {
        s3: s3Client,
        config,
    };
}

function normalizeImageUploadInput(ext = "jpg", mime = "image/jpeg") {
    const normalizedMime = mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
    const normalizedExt = ext.toLowerCase().replace(/^\./, "");
    const allowedExtensions = ALLOWED_IMAGE_MIME[normalizedMime];

    if (!allowedExtensions || !allowedExtensions.includes(normalizedExt)) {
        throw new Error(INVALID_IMAGE_ERROR);
    }

    return {
        ext: normalizedExt === "jpeg" ? "jpg" : normalizedExt,
        mime: normalizedMime,
    };
}

function buildStoredObjectUrl(key: string) {
    const { config } = getS3Client();
    return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
}

function normalizeHost(host: string) {
    try {
        const value = host.includes("://") ? host : `https://${host}`;
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function getAllowedPublicHosts(accountId: string) {
    const hosts = new Set([`${accountId}.r2.cloudflarestorage.com`.toLowerCase()]);

    for (const key of PUBLIC_HOST_ENV_KEYS) {
        const value = process.env[key]?.trim();
        if (!value) continue;

        for (const host of value.split(",")) {
            const normalizedHost = normalizeHost(host.trim());
            if (normalizedHost) hosts.add(normalizedHost);
        }
    }

    return hosts;
}

async function generateUploadUrl(key: string, mime: string) {
    const { s3, config } = getS3Client();
    const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: mime,
    });

    return getSignedUrl(s3, command, { expiresIn: 120 });
}

export async function generatePresignedUrl(student_number: string, ext = "jpg", mime = "image/jpeg") {
    const upload = normalizeImageUploadInput(ext, mime);
    const key = `profile_photos/${student_number}.${upload.ext}`;
    const upload_url = await generateUploadUrl(key, upload.mime);
    const photo_url = buildStoredObjectUrl(key);

    return { upload_url, photo_url };
}

export async function generateImageUploadUrl(
    student_number: string | number,
    type: "GRADUATION" | "THEME",
    year: number,
    ext = "jpg",
    mime = "image/jpeg"
) {
    const upload = normalizeImageUploadInput(ext, mime);
    const folder = type === "GRADUATION" ? "graduation_photos" : "theme_photos";
    const key = `${folder}/${year}/${student_number}.${upload.ext}`;
    const upload_url = await generateUploadUrl(key, upload.mime);
    const photo_url = buildStoredObjectUrl(key);

    return { upload_url, photo_url };
}

function extractKey(photo_url: string): string | null {
    try {
        const config = getR2Config();
        const { hostname, pathname } = new URL(photo_url);
        const normalizedHost = hostname.toLowerCase();
        const r2Host = `${config.accountId}.r2.cloudflarestorage.com`.toLowerCase();

        if (!getAllowedPublicHosts(config.accountId).has(normalizedHost)) {
            return null;
        }

        if (normalizedHost === r2Host) {
            const bucketPrefix = `/${config.bucket}/`;
            return pathname.startsWith(bucketPrefix)
                ? pathname.slice(bucketPrefix.length)
                : null;
        }

        // Configured custom domain paths are expected to be stored as /<key>.
        return pathname.slice(1) || null;
    } catch {
        return null;
    }
}

function isAllowedImageKey(key: string) {
    return /\.(jpe?g|png)$/i.test(key);
}

export function isProfilePhotoUrlForStudent(photo_url: string, student_number: string | number) {
    const key = extractKey(photo_url);
    if (!key || !isAllowedImageKey(key)) return false;

    return new RegExp(`^profile_photos/${student_number}\\.(jpe?g|png)$`, "i").test(key);
}

export function isYearbookImageUrlForStudent(
    photo_url: string,
    student_number: string | number,
    type: "GRADUATION" | "THEME",
    year: number,
) {
    const key = extractKey(photo_url);
    if (!key || !isAllowedImageKey(key)) return false;

    const folder = type === "GRADUATION" ? "graduation_photos" : "theme_photos";
    return new RegExp(`^${folder}/${year}/${student_number}\\.(jpe?g|png)$`, "i").test(key);
}

export async function generateReadUrl(photo_url: string | null): Promise<string | null> {
    if (!photo_url) return null;
    const key = extractKey(photo_url);
    if (!key) return null;

    try {
        const { s3, config } = getS3Client();
        const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
        return await getSignedUrl(s3, command, { expiresIn: 3600 });
    } catch (err) {
        console.error("R2 read URL error:", err instanceof Error ? err.message : err);
        return null;
    }
}

export async function uploadPhotoUrl(student_number: string, photo_url: string) {
    if (!isProfilePhotoUrlForStudent(photo_url, student_number)) {
        return {
            success: false,
            reason: "Invalid profile photo URL"
        };
    }

    const student = await prisma.student.findUnique({
        where: {
            student_number: parseInt(student_number)
        }
    });

    if (!student) {
        return {
            success: false,
            reason: "Student doesn't exist"
        };
    }

    await prisma.studentDetail.update({
        where: {
            id: student.id
        },
        data: {
            photo_url: photo_url
        }
    });

    return { success: true };
}
