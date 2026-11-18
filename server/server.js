// Parc Fermé — the local server.
//
//   GET   /api/catalogue              every car, with prices, specs and today's stock
//   GET   /api/history/:id            a car's dealership appearances since 2022
//   GET   /api/garage                 what you own / shortlisted / notes / overrides
//   PATCH /api/garage/cars/:id        change one car   { owned, shortlist, notes, priceOverride }
//   POST  /api/garage/bulk            change many      { ids: [...], patch: {...} }
//   PUT   /api/garage/wallet          your current credits { wallet }
//   GET   /api/garage/export          download the garage as JSON
//   POST  /api/garage/import          restore a garage export
//   POST  /api/sync                   refresh the catalogue { full?: true }
//   GET   /api/sync/status            what the sync is doing / last did
//   GET   /api/images/car/:id/:shot   official photo, resized and cached (?w=320|800|1600)
//   GET   /api/images/logo/:makerId   manufacturer logo, cached
//
// There is no API key anywhere: every source is public, so unlike the shoe
// tracker's KicksDB proxy there is nothing to hide and no quota to ration.
// Searching the catalogue happens in the browser, instantly.

import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncer } from './lib/sync/index.mjs';
import { createGarageStore } from './lib/store.mjs';
import { createImageService } from './lib/images.mjs';
import { joinGarage, summarise } from '../shared/collection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// PARC_DATA_DIR points the server at another data folder: a second garage,
// or a scratch copy to try changes against without touching the real one.
const DATA_DIR = process.env.PARC_DATA_DIR ? path.resolve(process.env.PARC_DATA_DIR) : path.join(here, 'data');
const DIST_DIR = path.resolve(here, '../dist');
// Its own variable, not PORT: dev tooling commonly sets PORT for the whole
// process tree, which would put this server on the frontend's port.
// PORT is honoured as a fallback because hosts such as Railway assign it.
const PORT = Number(process.env.API_PORT || process.env.PORT || 8797);
// Localhost only by default. To open the tracker on a phone on the same
// network, start with HOST=0.0.0.0 (see README).
const HOST = process.env.HOST || '127.0.0.1';

const SYNC_CHECK_EVERY = 60 * 60_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const syncer = createSyncer(DATA_DIR);
let catalogue = null;
let catalogueBody = null;
let carIds = new Set();
let history = null;

async function loadCatalogue() {
  try {
    const raw = await fs.readFile(syncer.paths.catalogue, 'utf8');
    catalogue = JSON.parse(raw);
    catalogueBody = raw;
    carIds = new Set(catalogue.cars.map((c) => c.id));
    history = null; // re-read lazily
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function loadHistory() {
  if (history) return history;
  try {
    history = JSON.parse(await fs.readFile(syncer.paths.history, 'utf8'));
  } catch {
    history = {};
  }
  return history;
}

const garage = createGarageStore(DATA_DIR, {
  isKnownCar: (id) => (carIds.size === 0 ? Number.isInteger(id) && id > 0 : carIds.has(id)),
});

const images = createImageService({
  dataDir: DATA_DIR,
  getLogoUrl: (makerId) => catalogue?.makers.find((m) => m.id === makerId)?.logo || null,
});

const todayUtc = () => new Date().toISOString().slice(0, 10);

async function runSync(options = {}) {
  const result = await syncer.run({ ...options, log: (line) => line && console.log(`[sync] ${line}`) });
  if (result.changed) {
    await loadCatalogue();
    images.reset();
    console.log(
      `[sync] catalogue rebuilt: ${result.cars} cars, dealerships ${result.dealershipDate}` +
        (result.newCars.length ? `, ${result.newCars.length} new` : '')
    );
  }
  return result;
}

/**
 * Sync when there is something to gain: no catalogue at all, or the
 * dealership data is older than today (gt7info rotates at 00:00 UTC). The
 * syncer itself decides whether the official list or wiki also need a refresh.
 */
async function maybeSync(reason) {
  if (syncer.status.running) return;
  const state = await syncer.readState();
  const checkedRecently = state?.checkedAt && Date.now() - Date.parse(state.checkedAt) < SYNC_CHECK_EVERY - 60_000;
  const stale = !catalogue || (catalogue.dealershipDate || '') < todayUtc();
  if (catalogue && (!stale || checkedRecently)) return;
  console.log(`[sync] ${reason}`);
  runSync().catch((error) => console.error(`[sync] failed: ${error.message}`));
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Owner-only writes. The deployed copy is public and read-only; ADMIN_TOKEN is
// a long random secret on the host, sent as a bearer token by the owner's
// browser and the MCP server. Unset (local use), everyone is the owner.
// One shared secret with no expiry is the smallest thing that keeps strangers
// out; hardening means real accounts and scoped, revocable tokens.
// ---------------------------------------------------------------------------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function isOwner(req) {
  if (!ADMIN_TOKEN) return true;
  const header = req.get('authorization') || '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(ADMIN_TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
const requireOwner = (req, res, next) =>
  isOwner(req) ? next() : res.status(401).json({ error: 'This copy is read-only. Sign in as the owner to make changes.' });

app.get('/api/auth', (req, res) => res.json({ canEdit: isOwner(req), authRequired: Boolean(ADMIN_TOKEN) }));

app.get('/health', (_req, res) => res.json({ ok: true, app: 'parc-ferme' }));

app.get('/api/catalogue', (req, res) => {
  if (!catalogue) {
    return res.status(503).json({
      error: 'The catalogue is being built for the first time',
      syncing: syncer.status.running,
      step: syncer.status.step,
    });
  }
  const etag = `W/"${catalogue.generatedAt}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.type('application/json').send(catalogueBody);
});

app.get(
  '/api/history/:id',
  handle(async (req, res) => {
    const all = await loadHistory();
    const stints = all[Number(req.params.id)] || [];
    res.json({
      id: Number(req.params.id),
      stints: stints.map(([dealer, from, to, cr, state, continues]) => ({ dealer, from, to, cr, state, continues: Boolean(continues) })),
    });
  })
);

// The headline numbers, worked out with the same maths the page uses, so a
// client (the MCP server) never has to download the whole catalogue to ask
// "how far from finishing am I?". Optional filters narrow the scope.
app.get(
  '/api/summary',
  handle(async (req, res) => {
    if (!catalogue) return res.status(503).json({ error: 'The catalogue is still being built' });
    const g = await garage.get();
    let entries = joinGarage(catalogue.cars, g.cars);
    const { maker, carClass, dealer } = req.query;
    if (maker) entries = entries.filter((e) => e.car.maker.toLowerCase() === String(maker).toLowerCase());
    if (carClass) entries = entries.filter((e) => (e.car.carClass || '').toLowerCase() === String(carClass).toLowerCase());
    if (dealer) entries = entries.filter((e) => e.car.dealer === dealer);
    const stats = summarise(entries);
    res.json({ ...stats, wallet: g.wallet ?? null, dealershipDate: catalogue.dealershipDate, generatedAt: catalogue.generatedAt });
  })
);

app.get('/api/garage', handle(async (_req, res) => res.json(await garage.get())));

app.patch(
  '/api/garage/cars/:id',
  requireOwner,
  handle(async (req, res) => res.json({ id: Number(req.params.id), record: await garage.patchCar(req.params.id, req.body) }))
);

app.post(
  '/api/garage/bulk',
  requireOwner,
  handle(async (req, res) => res.json(await garage.patchMany(req.body?.ids, req.body?.patch)))
);

app.put('/api/garage/wallet', requireOwner, handle(async (req, res) => res.json(await garage.setWallet(req.body?.wallet))));

app.get(
  '/api/garage/export',
  handle(async (_req, res) => {
    const data = await garage.get();
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="parc-ferme-garage-${stamp}.json"`);
    res.json({ exportedAt: new Date().toISOString(), ...data });
  })
);

app.post('/api/garage/import', requireOwner, handle(async (req, res) => res.json(await garage.replace(req.body))));

app.post(
  '/api/sync',
  requireOwner,
  handle(async (req, res) => {
    const result = await runSync({ full: Boolean(req.body?.full), force: Boolean(req.body?.force) });
    res.json({ ...result, generatedAt: catalogue?.generatedAt || null });
  })
);

app.get(
  '/api/sync/status',
  handle(async (_req, res) => {
    const state = await syncer.readState();
    res.json({
      running: syncer.status.running,
      step: syncer.status.step,
      lastError: syncer.status.lastError,
      lastResult: syncer.status.lastResult,
      checkedAt: state?.checkedAt || null,
      syncedAt: state?.syncedAt || null,
      generatedAt: catalogue?.generatedAt || null,
      dealershipDate: catalogue?.dealershipDate || null,
    });
  })
);

const sendImage = (res, file, type) => {
  res.set('Cache-Control', 'public, max-age=2592000');
  res.type(type).sendFile(file);
};

app.get(
  '/api/images/car/:id/:shot',
  handle(async (req, res) => sendImage(res, await images.photo(req.params.id, req.params.shot, req.query.w), 'image/webp'))
);

app.get(
  '/api/images/logo/:makerId',
  handle(async (req, res) => sendImage(res, await images.logo(req.params.makerId), 'image/png'))
);

// Unknown API routes answer in JSON like every other API response.
app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint' }));

// Production: `npm run build` then `npm start` serves the app from here too,
// so the whole thing is one process on one port.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|health).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large', detail: `Limit is ${err.limit} bytes` });
  }
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err?.message || 'Unknown server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

await loadCatalogue();

const server = app.listen(PORT, HOST, () => {
  console.log(`Parc Fermé server on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!catalogue) {
    console.log('[sync] No catalogue yet: building it now (about 15 seconds).');
    runSync({ force: true }).catch((error) => console.error(`[sync] first sync failed: ${error.message}`));
  } else {
    maybeSync('Dealership data is from before today: checking for the new rotation.');
  }
  setInterval(() => maybeSync('Hourly check for a new dealership rotation.'), SYNC_CHECK_EVERY).unref();
});

server.on('error', async (error) => {
  if (error.code !== 'EADDRINUSE') throw error;
  // Another copy of this server is probably already running (e.g. `npm start`
  // in one terminal and `npm run dev` in another). Say so plainly.
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
    const body = await res.json();
    if (body.app === 'parc-ferme') {
      console.log(`Port ${PORT} already has a Parc Fermé server running; using that one.`);
      process.exit(0);
    }
  } catch {
    // fall through
  }
  console.error(`Port ${PORT} is taken by something else. Start with API_PORT=<another port> npm run dev.`);
  process.exit(1);
});
