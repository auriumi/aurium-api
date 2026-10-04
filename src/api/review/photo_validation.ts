import sharp from "sharp";
import { ReviewRequestError } from "./review_error";
import type { PhotoMime } from "./photo_storage";

const maxDimension = 8192;
const maxPixels = 32_000_000;
const formats: Record<PhotoMime, string> = {
  "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp",
};

// A header can look valid while the compressed pixels are corrupt. Decode before
// sealing, with resource limits, but retain the uploaded bytes and their metadata.
export async function validatePhotoPixels(bytes: Buffer, mime: PhotoMime) {
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: maxPixels });
  try {
    const metadata = await image.metadata();
    if (metadata.format !== formats[mime] || (metadata.pages ?? 1) !== 1) {
      throw new ReviewRequestError(422, "INVALID_PHOTO", "Upload a single, still JPEG, PNG or WebP photo.");
    }
    if (!metadata.width || !metadata.height || metadata.width > maxDimension ||
        metadata.height > maxDimension || metadata.width * metadata.height > maxPixels) {
      throw new ReviewRequestError(422, "PHOTO_DIMENSIONS", "Photos must be at most 8192 pixels per side and 32 megapixels.");
    }
    // Force full pixel decoding; metadata() alone never checks compressed pixels.
    await image.timeout({ seconds: 10 }).raw().toBuffer();
  } catch (error) {
    if (error instanceof ReviewRequestError) throw error;
    throw new ReviewRequestError(422, "INVALID_PHOTO", "The photo could not be decoded within the image limits. Export it again as a still JPEG, PNG or WebP, up to 8192 pixels per side and 32 megapixels.");
  } finally {
    image.destroy();
  }
}
