import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sanitizeProjectCover } from "../portfolio-covers";
import { PROJECT_LIMITS } from "../portfolio-input";

const image = (width = 40, height = 20) => sharp({ create: { width, height, channels: 3, background: "#50bcb5" } });

describe("portfolio cover processing", () => {
  it.each(["png", "jpeg", "webp"] as const)("decodes %s and writes metadata-free WebP", async (format) => {
    const original = await image().withExif({ IFD0: { Artist: "Private Metadata Canary" } }).toFormat(format).toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const result = await sanitizeProjectCover(original);
    expect(await sharp(result).metadata()).toMatchObject({ width: 40, height: 20, format: "webp" });
    const metadata = await sharp(result).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(result.includes("Private Metadata Canary")).toBe(false);
  });

  it("resizes within the output bound and rejects oversized source dimensions", async () => {
    const output = await sanitizeProjectCover(await image(2000, 500).png().toBuffer());
    expect(await sharp(output).metadata()).toMatchObject({ width: 1600, height: 400 });
    await expect(sanitizeProjectCover(await image(4097, 4).png().toBuffer())).rejects.toMatchObject({ status: 422 });
  });

  it("rejects non-raster, fake, truncated, and oversized covers without publishing anything", async () => {
    const png = await image().png().toBuffer();
    for (const input of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), Buffer.from("not a real image"), png.subarray(0, 32)]) {
      await expect(sanitizeProjectCover(input)).rejects.toMatchObject({ status: 422, code: "invalid_cover" });
    }
    await expect(sanitizeProjectCover(Buffer.alloc(PROJECT_LIMITS.coverBytes + 1))).rejects.toMatchObject({ status: 413 });
  });
});
