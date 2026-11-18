// Source 3 of 3: the Gran Turismo Wiki (gran-turismo.fandom.com, CC BY-SA).
//
// gt7info's Brand Central price list was last revised for game version 1.12,
// so every Brand Central car added since -- around a hundred of them -- has no
// list price there. The wiki's car pages carry GT7 acquisition fields for
// almost every car:
//
//   |gt7dealership = Ferrari [[Brand Central (GT7)|Brand Central]]
//   |gt7credits    = 500,000
//   |gt7update     = 1.65
//   |gt7othermethods = Complete the [[GT7 Master International B-License|...]]
//
// Pages are fetched through the MediaWiki API, 25 at a time, so the whole
// roster is ~25 polite requests. Only factual fields are extracted.

import { fetchJson, mapPool, sleep } from '../http.mjs';

const API = 'https://gran-turismo.fandom.com/api.php';
const BATCH = 25;
const FIELDS = ['gt7dealership', 'gt7credits', 'gt7update', 'gt7othermethods'];

const query = (params) =>
  `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString()}`;

// ---------------------------------------------------------------------------
// Wikitext handling
// ---------------------------------------------------------------------------

/** Read the raw value of a template parameter, respecting [[..|..]] and {{..|..}}. */
export function readParam(wikitext, name) {
  const re = new RegExp(`\\|\\s*${name}\\s*=`, 'i');
  const m = re.exec(wikitext);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depthLink = 0;
  let depthTpl = 0;
  let out = '';
  while (i < wikitext.length) {
    if (wikitext.startsWith('<ref', i)) {
      // Skip references wholesale; they are footnotes, and their insides are
      // full of pipes.
      const selfClose = wikitext.indexOf('/>', i);
      const open = wikitext.indexOf('>', i);
      if (selfClose !== -1 && selfClose < open + 1) {
        i = selfClose + 2;
        continue;
      }
      const close = wikitext.indexOf('</ref>', i);
      i = close === -1 ? wikitext.length : close + 6;
      continue;
    }
    if (wikitext.startsWith('<!--', i)) {
      const close = wikitext.indexOf('-->', i);
      i = close === -1 ? wikitext.length : close + 3;
      continue;
    }
    const two = wikitext.slice(i, i + 2);
    if (two === '[[') { depthLink += 1; out += two; i += 2; continue; }
    if (two === ']]' && depthLink > 0) { depthLink -= 1; out += two; i += 2; continue; }
    if (two === '{{') { depthTpl += 1; out += two; i += 2; continue; }
    if (two === '}}') {
      if (depthTpl === 0) break; // end of the enclosing template
      depthTpl -= 1;
      out += two;
      i += 2;
      continue;
    }
    const ch = wikitext[i];
    if (ch === '|' && depthLink === 0 && depthTpl === 0) break;
    out += ch;
    i += 1;
  }
  return out.trim();
}

/** Wikitext -> plain text. */
export function cleanWikitext(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw);
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, ' / ');
  // Links: [[Target|Label]] -> Label, [[Target]] -> Target. Repeated so
  // links nested in templates resolve too.
  for (let pass = 0; pass < 3; pass += 1) {
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  }
  // External links: [http://x Label] -> Label
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
  // Templates: {{DLC}} -> DLC, {{Name|first|...}} -> first. Innermost first.
  for (let pass = 0; pass < 4; pass += 1) {
    s = s.replace(/\{\{([^{}|]*)(?:\|([^{}|]*))?[^{}]*\}\}/g, (_, name, first) =>
      (first && !first.includes('=') ? first : name).trim()
    );
  }
  s = s.replace(/'''?/g, '').replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return s.replace(/\s+/g, ' ').trim() || null;
}

export function parseCredits(text) {
  if (!text) return { credits: null, approx: false };
  const m = text.replace(/\s/g, '').match(/(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!m) return { credits: null, approx: false };
  const credits = Number(m[1].replace(/,/g, ''));
  const approx = /or less|or more|approx|~|varies|around|up to/i.test(text);
  return { credits: Number.isFinite(credits) ? credits : null, approx };
}

export function extractGt7Fields(wikitext) {
  const raw = Object.fromEntries(FIELDS.map((f) => [f, readParam(wikitext, f)]));
  const creditsText = cleanWikitext(raw.gt7credits);
  const { credits, approx } = parseCredits(creditsText);
  return {
    dealership: cleanWikitext(raw.gt7dealership),
    creditsText,
    credits,
    approx,
    update: cleanWikitext(raw.gt7update),
    otherMethods: cleanWikitext(raw.gt7othermethods),
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchPages(titles) {
  const url = query({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: titles.join('|'),
  });
  const data = await fetchJson(url, { timeoutMs: 45_000 });
  const q = data.query || {};
  // requested -> normalized -> redirected -> page
  const step = (list) => Object.fromEntries((list || []).map((x) => [x.from, x.to]));
  const normalized = step(q.normalized);
  const redirects = step(q.redirects);
  const pages = Object.fromEntries((q.pages || []).map((p) => [p.title, p]));
  const out = {};
  for (const requested of titles) {
    let t = normalized[requested] || requested;
    t = redirects[t] || t;
    const page = pages[t];
    if (!page || page.missing || page.invalid) {
      out[requested] = { missing: true };
      continue;
    }
    const content = page.revisions?.[0]?.slots?.main?.content;
    out[requested] = content === undefined ? { retry: true } : { title: page.title, content };
  }
  return out;
}

async function searchTitle(name) {
  const url = query({ action: 'query', list: 'search', srsearch: name, srlimit: '6', srnamespace: '0' });
  const data = await fetchJson(url, { timeoutMs: 30_000 });
  const hits = data.query?.search || [];
  const wanted = norm(name);
  const year = wanted.match(/'(\d{2})\b/)?.[0];
  const words = wanted.split(' ').filter((w) => w.length > 1);
  let best = null;
  for (const hit of hits) {
    const t = norm(hit.title);
    if (year && !t.includes(year)) continue;
    const shared = words.filter((w) => t.split(' ').includes(w)).length;
    const score = shared / Math.max(words.length, t.split(' ').length);
    if (score >= 0.6 && (!best || score > best.score)) best = { title: hit.title, score };
  }
  return best?.title ?? null;
}

/**
 * Look up GT7 acquisition fields for a list of cars.
 * `cars` is [{ id, title }], where `title` is the best-guess page name.
 * Returns { [id]: { title, dealership, credits, ... } | { missing: true } }.
 */
export async function fetchWiki(cars, { log = () => {} } = {}) {
  const results = {};
  const byTitle = new Map(cars.map((c) => [c.title, c.id]));
  const titles = [...byTitle.keys()];

  const batches = [];
  for (let i = 0; i < titles.length; i += BATCH) batches.push(titles.slice(i, i + BATCH));

  const unresolved = [];
  await mapPool(batches, 2, async (batch, index) => {
    let pages;
    try {
      pages = await fetchPages(batch);
    } catch (error) {
      log(`  wiki batch ${index + 1}/${batches.length} failed: ${error.message}`);
      return;
    }
    for (const [title, page] of Object.entries(pages)) {
      const id = byTitle.get(title);
      if (page.content) results[id] = { title: page.title, ...extractGt7Fields(page.content) };
      else unresolved.push({ id, title, retry: Boolean(page.retry) });
    }
    await sleep(250);
  });

  // Second chance: pages the batch could not fit are fetched alone; pages that
  // do not exist under the guessed name are searched for.
  await mapPool(unresolved, 2, async ({ id, title, retry }) => {
    try {
      let target = title;
      if (!retry) target = await searchTitle(title);
      if (!target) {
        results[id] = { missing: true };
        return;
      }
      const page = (await fetchPages([target]))[target];
      results[id] = page?.content ? { title: page.title, ...extractGt7Fields(page.content) } : { missing: true };
    } catch {
      // Left unset: the next sync will try again.
    }
    await sleep(200);
  });

  return results;
}
