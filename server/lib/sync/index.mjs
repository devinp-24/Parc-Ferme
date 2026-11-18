// The sync: fetch what is stale, merge, write the catalogue.
//
// How each source is refreshed, and why:
//
//   gt7info    every sync, but only downloaded when its commit has moved. It
//              changes once a day (00:00 UTC, when the dealerships rotate) and
//              whenever a game update adds cars.
//   official   weekly, or immediately when gt7info lists a car the cached
//              official data does not have -- that is what a game update looks
//              like from here.
//   wiki       every two weeks in full; in between, only cars it has not seen.
//
// Your garage (owned / shortlisted / notes / overrides) lives in a different
// file and is never read or written here, so a sync can never lose it.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchGt7info, latestGt7infoCommit } from './gt7info.mjs';
import { fetchOfficial } from './official.mjs';
import { fetchWiki } from './wiki.mjs';
import { buildCatalogue } from './merge.mjs';

const DAY = 86_400_000;
const OFFICIAL_MAX_AGE = 7 * DAY;
const WIKI_MAX_AGE = 14 * DAY;
const WIKI_MISSING_RETRY = 3 * DAY;

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

/** Write via a temp file and rename, so a crash mid-write never leaves half a file. */
export async function writeJsonAtomic(file, value, pretty = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
  await fs.rename(tmp, file);
}

const age = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);

export function createSyncer(dataDir) {
  const paths = {
    catalogue: path.join(dataDir, 'catalogue.json'),
    history: path.join(dataDir, 'history.json'),
    imageIndex: path.join(dataDir, 'cache', 'official-images.json'),
    official: path.join(dataDir, 'cache', 'official.json'),
    wiki: path.join(dataDir, 'cache', 'wiki.json'),
    state: path.join(dataDir, 'cache', 'sync-state.json'),
  };

  const status = { running: false, step: null, lastResult: null, lastError: null };
  let running = null;

  async function doSync({ full = false, force = false, log = () => {} } = {}) {
    const startedAt = Date.now();
    const warnings = [];
    let stepStarted = startedAt;
    let stepText = null;
    const step = (text) => {
      // Each line reports how long the previous step took, so a slow source
      // is obvious in the log rather than hiding inside one total.
      const now = Date.now();
      if (stepText) log(`${stepText} ${((now - stepStarted) / 1000).toFixed(1)}s`);
      stepText = text;
      stepStarted = now;
      status.step = text;
    };

    const state = (await readJson(paths.state, {})) || {};
    const previous = await readJson(paths.catalogue);

    // 1. gt7info -----------------------------------------------------------
    step('Checking gt7info for new dealership data…');
    const tip = await latestGt7infoCommit();
    state.checkedAt = new Date().toISOString();

    const officialCache = await readJson(paths.official);
    const wikiCache = (await readJson(paths.wiki)) || { fetchedAt: null, entries: {} };
    const officialStale = full || !officialCache || age(officialCache.fetchedAt) > OFFICIAL_MAX_AGE;
    const wikiStale = full || !wikiCache.fetchedAt || age(wikiCache.fetchedAt) > WIKI_MAX_AGE;

    const unchanged = previous && tip && tip === state.gt7infoCommit && !officialStale && !wikiStale;
    if (unchanged && !force) {
      step(null);
      await writeJsonAtomic(paths.state, state, true);
      return { changed: false, reason: 'Already up to date', dealershipDate: previous.dealershipDate };
    }

    step('Downloading gt7info (roster, prices, dealership history)…');
    const gt7info = await fetchGt7info();

    // 2. Official car list ------------------------------------------------
    let official = officialCache;
    const roster = gt7info.cars.map((c) => c.id);
    const missingFromOfficial = officialCache ? roster.filter((id) => !officialCache.cars[id]) : roster;
    const newCarsUnknown = missingFromOfficial.length > 0 && age(officialCache?.fetchedAt) > DAY;
    if (officialStale || newCarsUnknown) {
      step('Reading the official GT7 car list (specs and photos)…');
      try {
        official = await fetchOfficial();
        await writeJsonAtomic(paths.official, { ...official, imageChunks: undefined });
        await writeJsonAtomic(paths.imageIndex, { indexUrl: official.indexUrl, chunks: official.imageChunks });
      } catch (error) {
        warnings.push(`Official car list unavailable (${error.message}); using cached specs.`);
      }
    }

    // 3. Wiki -------------------------------------------------------------
    const makers = new Map(gt7info.makers.map((m) => [m.id, m.name]));
    const titleFor = (car) => official?.cars?.[car.id]?.nameLong || `${makers.get(car.makerId) || ''} ${car.shortName}`.trim();
    const wikiNeeded = gt7info.cars.filter((car) => {
      if (wikiStale) return true;
      const cached = wikiCache.entries[car.id];
      if (!cached) return true;
      return cached.missing && age(cached.checkedAt) > WIKI_MISSING_RETRY;
    });
    if (wikiNeeded.length) {
      step(`Matching ${wikiNeeded.length} cars against the Gran Turismo Wiki…`);
      try {
        const fresh = await fetchWiki(wikiNeeded.map((c) => ({ id: c.id, title: titleFor(c) })), { log });
        const checkedAt = new Date().toISOString();
        for (const [id, entry] of Object.entries(fresh)) wikiCache.entries[id] = { ...entry, checkedAt };
        if (wikiStale) wikiCache.fetchedAt = checkedAt;
        await writeJsonAtomic(paths.wiki, wikiCache);
      } catch (error) {
        warnings.push(`Wiki unavailable (${error.message}); using cached prices.`);
      }
    }

    // 4. Merge --------------------------------------------------------------
    step('Building the catalogue…');
    const { catalogue, history } = buildCatalogue({
      gt7info,
      official,
      wiki: wikiCache.entries,
      previous,
    });
    catalogue.warnings = warnings;
    await writeJsonAtomic(paths.catalogue, catalogue);
    await writeJsonAtomic(paths.history, history);

    state.gt7infoCommit = gt7info.commit || tip;
    state.syncedAt = catalogue.generatedAt;
    await writeJsonAtomic(paths.state, state, true);

    const result = {
      changed: true,
      cars: catalogue.cars.length,
      newCars: catalogue.newCars,
      dealershipDate: catalogue.dealershipDate,
      warnings,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10,
    };
    step(null);
    return result;
  }

  function run(options = {}) {
    if (running) return running;
    status.running = true;
    status.lastError = null;
    running = doSync(options)
      .then((result) => {
        status.lastResult = { ...result, finishedAt: new Date().toISOString() };
        return result;
      })
      .catch((error) => {
        status.lastError = { message: error.message, at: new Date().toISOString() };
        throw error;
      })
      .finally(() => {
        status.running = false;
        status.step = null;
        running = null;
      });
    return running;
  }

  return {
    run,
    paths,
    status,
    readState: () => readJson(paths.state, {}),
  };
}
