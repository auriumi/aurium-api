import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReviewRequestError } from "./review_error";
import { R2_BUCKET } from "../../config/r2_bucket";
import { validatePhotoPixels } from "./photo_validation";

const maxBytes = 5 * 1024 * 1024;
const minBytes = 64;
export const photoMimes = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMime = typeof photoMimes[number];

const storage = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACC_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACC_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

export function stagingKey(trackId: number) {
  return `review-staging/photos/${trackId}/${randomUUID()}`;
}

export async function signedPhotoUpload(key: string, mime: PhotoMime) {
  return getSignedUrl(storage, new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, ContentType: mime,
  }), { expiresIn: 120 });
}

export async function signedPhotoRead(key: string) {
  return getSignedUrl(storage, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 900 });
}

export function matchesPhotoSignature(bytes: Uint8Array, expectedMime: PhotoMime) {
  if (bytes.length < minBytes || bytes.length > maxBytes) return false;
  const head = Buffer.from(bytes);
  if (expectedMime === "image/jpeg") {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff &&
      head.at(-2) === 0xff && head.at(-1) === 0xd9;
  }
  if (expectedMime === "image/png") {
    return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      head.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  }
  return head.toString("ascii", 0, 4) === "RIFF" &&
    head.readUInt32LE(4) === head.length - 8 && head.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(head.toString("ascii", 12, 16));
}

// Read the complete staged object with a hard limit. This also prevents a
// replacement of the staging object between verification and final sealing.
export async function sealPhoto(stagedKey: string, expectedMime: PhotoMime, trackId: number, type: string) {
  let body;
  try {
    body = await storage.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: stagedKey }));
  } catch {
    throw new ReviewRequestError(409, "UPLOAD_MISSING", "The uploaded photo is unavailable. Upload it again.");
  }
  const stream = body.Body;
  if (!stream) throw new ReviewRequestError(409, "UPLOAD_MISSING", "The uploaded photo is empty.");
  if (body.ContentLength && body.ContentLength > maxBytes) {
    throw new ReviewRequestError(413, "PHOTO_TOO_LARGE", "Photos must be 5 MB or smaller.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      throw new ReviewRequestError(413, "PHOTO_TOO_LARGE", "Photos must be 5 MB or smaller.");
    }
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (!matchesPhotoSignature(bytes, expectedMime) || body.ContentType !== expectedMime) {
    throw new ReviewRequestError(422, "INVALID_PHOTO", "The file is not a valid photo of the selected type.");
  }
  await validatePhotoPixels(bytes, expectedMime);
  const finalKey = `review-final/photos/${trackId}/${type.toLowerCase()}/${randomUUID()}`;
  await storage.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: finalKey, Body: bytes, ContentType: expectedMime,
  }));
  return { finalKey, byteSize: size, sha256: createHash("sha256").update(bytes).digest("hex") };
}
