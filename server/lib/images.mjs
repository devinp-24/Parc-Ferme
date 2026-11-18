// Car photography and manufacturer logos, served from a local cache.
//
// The official 1920x1080 JPEGs run 120-350 KB each; a grid of 590 of them
// would be ~100 MB. The first request for a photo at a given size downloads it
// once, sharp makes a WebP at that width (~30 KB at grid size), and it is kept
// in data/images/ from then on.
//
// Nothing here fetches a caller-supplied URL. Photos are looked up by car ID
// and shot name in the index the sync built, logos by maker ID in the
// catalogue, so this cannot be used to proxy arbitrary addresses.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fetchBuffer } from './http.mjs';
import { fetchOfficialImageIndex, resolveImageChunk } from './sync/official.mjs';
import { writeJsonAtomic } from './sync/index.mjs';

export const PHOTO_WIDTHS = [320, 800, 1600];
// Dark studio gradients compress to almost nothing (~8 KB at 800 px), so
// quality can sit high enough that the backdrop never bands.
const QUALITY = { 320: 74, 800: 80, 1600: 82 };
const UPSTREAM_LIMIT = 6;
const INDEX_REFRESH_GAP = 10 * 60_000;

/**
 * GT7's "white" logo set is not white: about half the files are solid black
 * (Nissan, Toyota, BMW, Audi...) and the rest are full-colour badges. On a
 * black page the first half vanish. Every logo is redrawn as a light
 * monochrome: dark marks are inverted first, then each pixel becomes its own
 * brightness in grey, lifted so the mark reads on black. Alpha is untouched,
 * so a badge keeps its inner detail rather than becoming a white blob.
 */
async function monochromeLogo(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const luma = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    total += luma(i);
    count += 1;
  }
  const invert = count > 0 && total / count < 70;
  let after = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = invert ? 255 - luma(i) : luma(i);
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
    if (data[i + 3] >= 40) after += y;
  }
  const mean = count ? after / count : 255;
  const gain = Math.min(3, Math.max(1, 214 / Math.max(mean, 1)));
  if (gain > 1) {
    for (let i = 0; i < data.length; i += 4) {
      const y = Math.min(255, Math.round(data[i] * gain));
      data[i] = y;
      data[i + 1] = y;
      data[i + 2] = y;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export class ImageError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createImageService({ dataDir, getLogoUrl }) {
  const imageDir = path.join(dataDir, 'images');
  const indexFile = path.join(dataDir, 'cache', 'official-images.json');
  const urlCacheFile = path.join(dataDir, 'cache', 'image-urls.json');

  let index = null;
  let urlCache = null;
  let urlCacheDirty = null;
  let lastIndexRefresh = 0;
  const inflight = new Map();

  // A small semaphore: scrolling the grid can ask for a hundred photos at once,
  // and the official site should see a handful of requests at a time, not that.
  let active = 0;
  const waiting = [];
  const acquire = () =>
    new Promise((resolve) => {
      if (active < UPSTREAM_LIMIT) {
        active += 1;
        resolve();
      } else waiting.push(resolve);
    });
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  async function loadIndex() {
    if (index) return index;
    try {
      index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
    } catch {
      index = { indexUrl: null, chunks: {} };
    }
    return index;
  }

  async function loadUrlCache() {
    if (urlCache) return urlCache;
    try {
      urlCache = JSON.parse(await fs.readFile(urlCacheFile, 'utf8'));
    } catch {
      urlCache = {};
    }
    return urlCache;
  }

  function persistUrlCache() {
    clearTimeout(urlCacheDirty);
    urlCacheDirty = setTimeout(() => writeJsonAtomic(urlCacheFile, urlCache).catch(() => {}), 1500);
  }

  async function refreshIndex() {
    if (Date.now() - lastIndexRefresh < INDEX_REFRESH_GAP) return false;
    lastIndexRefresh = Date.now();
    const fresh = await fetchOfficialImageIndex();
    index = fresh;
    urlCache = {};
    await writeJsonAtomic(indexFile, fresh);
    return true;
  }

  async function sourceUrl(key) {
    await loadIndex();
    await loadUrlCache();
    const chunk = index.chunks?.[key];
    if (!chunk) throw new ImageError('No official photo for that car', 404);
    if (urlCache[chunk]) return urlCache[chunk];
    const url = await resolveImageChunk(index.indexUrl, chunk);
    urlCache[chunk] = url;
    persistUrlCache();
    return url;
  }

  async function download(key) {
    await acquire();
    try {
      try {
        return await fetchBuffer(await sourceUrl(key), { timeoutMs: 30_000, retries: 1 });
      } catch (error) {
        // A redeploy renames every chunk and photo. Re-read the index once and
        // try again before giving up.
        if (error instanceof ImageError) throw error;
        if (await refreshIndex()) return await fetchBuffer(await sourceUrl(key), { timeoutMs: 30_000, retries: 1 });
        throw error;
      }
    } finally {
      release();
    }
  }

  async function photo(carId, shot, width) {
    if (!/^\d+$/.test(String(carId)) || !/^\d_\d{2}$/.test(shot)) throw new ImageError('Bad photo reference', 400);
    const w = PHOTO_WIDTHS.includes(Number(width)) ? Number(width) : 800;
    const key = `car${Number(carId)}_${shot}`;
    const file = path.join(imageDir, `w${w}`, `${key}.webp`);
    try {
      await fs.access(file);
      return file;
    } catch {
      // not cached yet
    }
    const job = `${key}@${w}`;
    if (inflight.has(job)) return inflight.get(job);
    const work = (async () => {
      const original = await download(key);
      const out = await sharp(original)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: QUALITY[w] || 76, effort: 4 })
        .toBuffer();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, out);
      return file;
    })().finally(() => inflight.delete(job));
    inflight.set(job, work);
    return work;
  }

  async function logo(makerId) {
    if (!/^\d+$/.test(String(makerId))) throw new ImageError('Bad maker reference', 400);
    const file = path.join(imageDir, 'logos-mono', `tnr${Number(makerId)}.png`);
    try {
      await fs.access(file);
      return file;
    } catch {
      // not cached yet
    }
    const url = getLogoUrl(Number(makerId));
    if (!url) throw new ImageError('No logo for that maker', 404);
    const job = `logo${makerId}`;
    if (inflight.has(job)) return inflight.get(job);
    const work = (async () => {
      await acquire();
      try {
        const buf = await fetchBuffer(url, { timeoutMs: 20_000, retries: 1 });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, await monochromeLogo(buf));
        return file;
      } finally {
        release();
      }
    })().finally(() => inflight.delete(job));
    inflight.set(job, work);
    return work;
  }

  return {
    photo,
    logo,
    /** Called after a sync that re-read the official list. */
    reset() {
      index = null;
      urlCache = null;
    },
  };
}
