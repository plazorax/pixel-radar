import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** RGBA pixels, 4 bytes per pixel, row by row. */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface CompareOptions {
  /** pixelmatch colour threshold (0..1). Higher ignores more subtle colour differences. */
  pixelThreshold?: number;
}

export interface CompareResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  /** 1 = identical, 0 = every pixel differs. */
  similarity: number;
  sizeChanged: boolean;
  diff: RawImage;
}

/** Colour used to mark changed pixels in the diff image (matches the dashboard accent). */
export const DIFF_COLOR: [number, number, number] = [196, 30, 100];
/** Pixels pixelmatch classifies as anti-aliasing: shown faintly, not counted as changes. */
export const AA_COLOR: [number, number, number] = [240, 190, 210];

/**
 * Compares two images pixel by pixel.
 *
 * Images of different sizes are compared on their overlapping area; every pixel outside the overlap
 * (for example a page that got taller) counts as changed, so a size change always lowers the score.
 * The diff image has the size of the larger dimensions: unchanged pixels are a faded copy of the
 * baseline and changed pixels are painted with DIFF_COLOR.
 */
export function compareImages(baseline: RawImage, current: RawImage, options: CompareOptions = {}): CompareResult {
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);
  const overlapWidth = Math.min(baseline.width, current.width);
  const overlapHeight = Math.min(baseline.height, current.height);
  const totalPixels = width * height;

  const overlapDiff = new Uint8Array(overlapWidth * overlapHeight * 4);
  const overlapChanged =
    overlapWidth > 0 && overlapHeight > 0
      ? pixelmatch(
          crop(baseline, overlapWidth, overlapHeight),
          crop(current, overlapWidth, overlapHeight),
          overlapDiff,
          overlapWidth,
          overlapHeight,
          { threshold: options.pixelThreshold ?? 0.1, diffColor: DIFF_COLOR, aaColor: AA_COLOR, alpha: 0.2 },
        )
      : 0;

  const diffData = new Uint8Array(totalPixels * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      if (x < overlapWidth && y < overlapHeight) {
        const source = (y * overlapWidth + x) * 4;
        diffData.set(overlapDiff.subarray(source, source + 4), target);
      } else {
        diffData.set([...DIFF_COLOR, 255], target);
      }
    }
  }

  const diffPixels = overlapChanged + (totalPixels - overlapWidth * overlapHeight);
  return {
    width,
    height,
    diffPixels,
    totalPixels,
    similarity: totalPixels === 0 ? 1 : 1 - diffPixels / totalPixels,
    sizeChanged: baseline.width !== current.width || baseline.height !== current.height,
    diff: { width, height, data: diffData },
  };
}

/** Returns the top-left `width` x `height` area of an image as a new RGBA buffer. */
export function crop(image: RawImage, width: number, height: number): Uint8Array {
  if (width > image.width || height > image.height) throw new Error('Crop area is larger than the image');
  if (width === image.width && height === image.height) return image.data;
  const out = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const start = y * image.width * 4;
    out.set(image.data.subarray(start, start + rowBytes), y * rowBytes);
  }
  return out;
}

export function readPng(path: string): RawImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: png.data };
}

export function writePng(path: string, image: RawImage): void {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

/** Compares two PNG files and writes the diff image. */
export function compareFiles(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  options: CompareOptions = {},
): Omit<CompareResult, 'diff'> {
  const { diff, ...result } = compareImages(readPng(baselinePath), readPng(currentPath), options);
  writePng(diffPath, diff);
  return result;
}
