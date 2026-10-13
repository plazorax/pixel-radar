import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFiles, compareImages, crop, DIFF_COLOR, readPng, writePng } from '../src/compare.js';
import { setPixel, solid, tempDir } from './helpers.js';

describe('compareImages', () => {
  it('scores identical images as 1 with no changed pixels', () => {
    const result = compareImages(solid(20, 10), solid(20, 10));
    expect(result.similarity).toBe(1);
    expect(result.diffPixels).toBe(0);
    expect(result.totalPixels).toBe(200);
    expect(result.sizeChanged).toBe(false);
  });

  it('counts changed pixels and lowers the similarity proportionally', () => {
    let current = solid(10, 10);
    current = setPixel(current, 2, 2, [0, 0, 0]);
    current = setPixel(current, 7, 7, [0, 0, 0]);
    const result = compareImages(solid(10, 10), current);
    expect(result.diffPixels).toBe(2);
    expect(result.similarity).toBeCloseTo(0.98, 10);
  });

  it('marks changed pixels with the diff colour', () => {
    const result = compareImages(solid(4, 4), setPixel(solid(4, 4), 1, 1, [0, 0, 0]));
    const index = (1 * 4 + 1) * 4;
    expect(Array.from(result.diff.data.subarray(index, index + 3))).toEqual(DIFF_COLOR);
  });

  it('ignores colour differences below the pixel threshold', () => {
    const current = solid(10, 10, [252, 252, 252]);
    expect(compareImages(solid(10, 10), current, { pixelThreshold: 0.1 }).diffPixels).toBe(0);
    expect(compareImages(solid(10, 10), current, { pixelThreshold: 0 }).diffPixels).toBe(100);
  });

  it('counts the area outside the overlap as changed when sizes differ', () => {
    const result = compareImages(solid(10, 10), solid(10, 15));
    expect(result.sizeChanged).toBe(true);
    expect(result.width).toBe(10);
    expect(result.height).toBe(15);
    expect(result.totalPixels).toBe(150);
    expect(result.diffPixels).toBe(50);
    expect(result.similarity).toBeCloseTo(100 / 150, 10);
    expect(result.diff.data.length).toBe(150 * 4);
  });

  it('handles different widths and heights at once', () => {
    const result = compareImages(solid(8, 4), solid(4, 8));
    expect(result.totalPixels).toBe(64);
    expect(result.diffPixels).toBe(64 - 16);
  });
});

describe('crop', () => {
  it('returns the top-left area', () => {
    const image = setPixel(solid(3, 3), 1, 1, [0, 0, 0]);
    const cropped = crop(image, 2, 2);
    expect(cropped.length).toBe(16);
    expect(Array.from(cropped.subarray(12, 15))).toEqual([0, 0, 0]);
  });

  it('rejects an area larger than the image', () => {
    expect(() => crop(solid(2, 2), 3, 2)).toThrow();
  });
});

describe('compareFiles', () => {
  it('reads PNGs, writes a diff image and returns the score', () => {
    const dir = tempDir();
    const baseline = join(dir, 'baseline.png');
    const current = join(dir, 'current.png');
    const diff = join(dir, 'nested', 'diff.png');
    writePng(baseline, solid(10, 10));
    writePng(current, setPixel(solid(10, 10), 0, 0, [0, 0, 0]));

    const result = compareFiles(baseline, current, diff);
    expect(result.diffPixels).toBe(1);
    expect(result.similarity).toBeCloseTo(0.99, 10);
    expect(existsSync(diff)).toBe(true);
    expect(readPng(diff)).toMatchObject({ width: 10, height: 10 });
  });
});
