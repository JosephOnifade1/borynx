import sharp from "sharp";
import { HttpError } from "./errors";
import { PROJECT_LIMITS } from "./portfolio-input";

export const COVER_MAX_DIMENSION = 4096;
export const COVER_MAX_PIXELS = 12_000_000;
export const COVER_OUTPUT_DIMENSION = 1600;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function formatOf(bytes: Buffer) {
  if (bytes.subarray(0, PNG.length).equals(PNG)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function invalidCover(message: string) {
  return new HttpError(422, message, "invalid_cover", { file: message });
}

/** Decode only permitted raster formats, honor orientation, and persist pixels without metadata. */
export async function sanitizeProjectCover(input: Buffer): Promise<Buffer> {
  if (input.length > PROJECT_LIMITS.coverBytes) throw new HttpError(413, "Choose a cover no larger than 3 MiB.", "body_too_large");
  const format = formatOf(input);
  if (!format) throw invalidCover("Choose a PNG, JPEG, or WebP image.");
  try {
    const source = sharp(input, { limitInputPixels: COVER_MAX_PIXELS, failOn: "warning" });
    const metadata = await source.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 ||
      metadata.width > COVER_MAX_DIMENSION || metadata.height > COVER_MAX_DIMENSION || metadata.width * metadata.height > COVER_MAX_PIXELS) {
      throw invalidCover("Choose a still image within 4096 × 4096 pixels and at most 12 megapixels.");
    }
    const bytes = await source.autoOrient().resize({ width: COVER_OUTPUT_DIMENSION, height: COVER_OUTPUT_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    if (!bytes.length || bytes.length > PROJECT_LIMITS.coverBytes) throw invalidCover("Try a smaller cover image.");
    return bytes;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalidCover("The cover could not be decoded within the image size limits.");
  }
}
