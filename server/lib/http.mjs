// Outbound HTTP for the sync and the image proxy.
//
// Every request identifies itself honestly, times out, and retries only the
// failures that are worth retrying (rate limits and server errors). A 404 is
// an answer, not a hiccup, so it is thrown immediately.

const USER_AGENT = 'ParcFerme/1.0 (personal GT7 collection tracker, runs locally)';

export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { as = 'text', timeoutMs = 30_000, retries = 2, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (!res.ok) {
        const error = new HttpError(url, res.status);
        error.retryable = res.status === 429 || res.status >= 500;
        throw error;
      }
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer());
      if (as === 'json') return await res.json();
      return await res.text();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof HttpError ? error.retryable : true;
      if (!retryable || attempt === retries) break;
      await sleep(700 * 2 ** attempt);
    }
  }
  throw lastError;
}

export const fetchText = (url, options) => request(url, { ...options, as: 'text' });
export const fetchJson = (url, options) => request(url, { ...options, as: 'json' });
export const fetchBuffer = (url, options) => request(url, { ...options, as: 'buffer' });

/** Run `task` over `items`, never more than `limit` at once, preserving order. */
export async function mapPool(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
