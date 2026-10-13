import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RawImage } from '../src/compare.js';

/** A solid-colour RGBA image. */
export function solid(width: number, height: number, rgb: [number, number, number] = [255, 255, 255]): RawImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { width, height, data };
}

export function setPixel(image: RawImage, x: number, y: number, rgb: [number, number, number]): RawImage {
  const data = new Uint8Array(image.data);
  data.set([...rgb, 255], (y * image.width + x) * 4);
  return { ...image, data };
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pixel-radar-test-'));
}
