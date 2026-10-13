import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { validatePhotoPixels } from "./photo_validation";
import { matchesPhotoSignature } from "./photo_storage";

const create = { width: 64, height: 64, channels: 3 as const, background: "#986b32" };

test("real JPEG, PNG and WebP photos decode without changing the input", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({ create }).toFormat(format).toBuffer();
    const original = Buffer.from(bytes);
    await validatePhotoPixels(bytes, `image/${format}`);
    assert.deepEqual(bytes, original);
  }
});

test("matching outer signatures do not make fake or truncated pixels valid", async () => {
  const fake = Buffer.alloc(64);
  fake.set([255, 216, 255]);
  fake.set([255, 217], 62);
  assert.equal(matchesPhotoSignature(fake, "image/jpeg"), true);
  await assert.rejects(validatePhotoPixels(fake, "image/jpeg"), { code: "INVALID_PHOTO" });

  const png = await sharp({ create }).png().toBuffer();
  const broken = Buffer.concat([png.subarray(0, png.length - 24), png.subarray(-12)]);
  assert.equal(matchesPhotoSignature(broken, "image/png"), true);
  await assert.rejects(validatePhotoPixels(broken, "image/png"), { code: "INVALID_PHOTO" });
});

test("decoded type, side length and pixel area are checked", async () => {
  const png = await sharp({ create }).png().toBuffer();
  await assert.rejects(validatePhotoPixels(png, "image/jpeg"), { code: "INVALID_PHOTO" });
  const wide = await sharp({ create: { ...create, width: 8193, height: 1 } }).png().toBuffer();
  await assert.rejects(validatePhotoPixels(wide, "image/png"), { code: "PHOTO_DIMENSIONS" });
  const large = await sharp({ create: { ...create, width: 6000, height: 6000 } }).png().toBuffer();
  await assert.rejects(validatePhotoPixels(large, "image/png"), { code: "INVALID_PHOTO" });
});

test("animated WebP is rejected", async () => {
  const frames = Buffer.alloc(64 * 128 * 3, 128);
  frames.fill(240, 64 * 64 * 3);
  const animated = await sharp(frames, { raw: { width: 64, height: 128, channels: 3, pageHeight: 64 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(validatePhotoPixels(animated, "image/webp"), { code: "INVALID_PHOTO" });
});
