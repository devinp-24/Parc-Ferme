// Your garage: which cars you own, which are on your shortlist, notes, and
// any price you have corrected by hand. It is the only file in data/ that is
// yours rather than generated, so it gets the care:
//
//   - kept in memory and written through a queue, so two quick clicks can
//     never interleave and lose one another's change
//   - written atomically (temp file + rename)
//   - snapshotted to data/backups/ before a write, at most once every ten
//     minutes, keeping the latest 40. The shoe tracker backed up on every write,
//     which with per-click saves would rotate a whole afternoon away in forty
//     clicks; this keeps restore points that are actually far enough apart to
//     be useful.
//
// Records are keyed by the game's car ID. A record that has gone back to all
// defaults is deleted, so the file only ever lists cars you have touched.

import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from './sync/index.mjs';

const BACKUP_EVERY_MS = 10 * 60_000;
const BACKUP_LIMIT = 40;
const MAX_NOTES = 2000;
const MAX_WALLET = 999_999_999_999;

const EMPTY = Object.freeze({ owned: false, shortlist: false, notes: '', priceOverride: null });

export class GarageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanPatch(patch) {
  if (!patch || typeof patch !== 'object') throw new GarageError('Body must be an object of fields to change');
  const out = {};
  if ('owned' in patch) out.owned = Boolean(patch.owned);
  if ('shortlist' in patch) out.shortlist = Boolean(patch.shortlist);
  if ('notes' in patch) out.notes = String(patch.notes ?? '').slice(0, MAX_NOTES);
  if ('priceOverride' in patch) {
    const raw = patch.priceOverride;
    if (raw === null || raw === '' || raw === undefined) {
      out.priceOverride = null;
    } else {
      const n = Math.round(Number(String(raw).replace(/[^\d.]/g, '')));
      if (!Number.isFinite(n) || n < 0 || n > MAX_WALLET) throw new GarageError('priceOverride must be a whole number of credits');
      out.priceOverride = n;
    }
  }
  if (Object.keys(out).length === 0) throw new GarageError('Nothing to change');
  return out;
}

const isDefault = (r) =>
  !r.owned && !r.shortlist && !r.notes && (r.priceOverride === null || r.priceOverride === undefined);

export function createGarageStore(dataDir, { isKnownCar = () => true } = {}) {
  const file = path.join(dataDir, 'garage.json');
  const backupDir = path.join(dataDir, 'backups');
  let state = null;
  let queue = Promise.resolve();
  let lastBackupAt = 0;

  async function load() {
    if (state) return state;
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      state = {
        version: 1,
        wallet: Number.isFinite(parsed.wallet) ? parsed.wallet : null,
        cars: parsed.cars && typeof parsed.cars === 'object' ? parsed.cars : {},
        updatedAt: parsed.updatedAt || null,
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { version: 1, wallet: null, cars: {}, updatedAt: null };
    }
    return state;
  }

  async function backup() {
    if (Date.now() - lastBackupAt < BACKUP_EVERY_MS) return;
    let current;
    try {
      current = await fs.readFile(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(path.join(backupDir, `garage.${stamp}.json`), current);
    lastBackupAt = Date.now();
    const all = (await fs.readdir(backupDir)).filter((f) => f.startsWith('garage.') && f.endsWith('.json')).sort();
    await Promise.all(
      all.slice(0, Math.max(0, all.length - BACKUP_LIMIT)).map((f) => fs.unlink(path.join(backupDir, f)).catch(() => {}))
    );
  }

  /** Serialise every mutation through one queue. */
  function mutate(fn) {
    const run = queue.then(async () => {
      await load();
      const result = await fn(state);
      state.updatedAt = new Date().toISOString();
      await backup();
      await writeJsonAtomic(file, state, true);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  function applyPatch(cars, id, patch, now) {
    const before = cars[id] ? { ...EMPTY, ...cars[id] } : { ...EMPTY };
    const after = { ...before, ...patch };
    if (patch.owned === true && !before.owned) {
      after.ownedAt = now;
      // Buying a car takes it off the shortlist; the shortlist is "still to get".
      if (!('shortlist' in patch)) after.shortlist = false;
    }
    if (patch.owned === false) delete after.ownedAt;
    after.updatedAt = now;
    if (isDefault(after)) delete cars[id];
    else cars[id] = after;
    return cars[id] || { ...EMPTY };
  }

  return {
    file,
    async get() {
      return structuredClone(await load());
    },

    patchCar(id, rawPatch) {
      const key = String(Number(id));
      if (!isKnownCar(Number(key))) throw new GarageError(`Unknown car id ${id}`, 404);
      const patch = cleanPatch(rawPatch);
      return mutate((s) => applyPatch(s.cars, key, patch, new Date().toISOString()));
    },

    patchMany(ids, rawPatch) {
      if (!Array.isArray(ids) || ids.length === 0) throw new GarageError('ids must be a non-empty array');
      if (ids.length > 1000) throw new GarageError('Too many ids in one request');
      const keys = [...new Set(ids.map((id) => String(Number(id))))];
      const unknown = keys.filter((k) => !isKnownCar(Number(k)));
      if (unknown.length) throw new GarageError(`Unknown car id(s): ${unknown.slice(0, 5).join(', ')}`, 404);
      const patch = cleanPatch(rawPatch);
      return mutate((s) => {
        const now = new Date().toISOString();
        for (const key of keys) applyPatch(s.cars, key, patch, now);
        return { updated: keys.length };
      });
    },

    setWallet(value) {
      let wallet = null;
      if (value !== null && value !== '' && value !== undefined) {
        wallet = Math.round(Number(String(value).replace(/[^\d.]/g, '')));
        if (!Number.isFinite(wallet) || wallet < 0 || wallet > MAX_WALLET) throw new GarageError('wallet must be a whole number of credits');
      }
      return mutate((s) => {
        s.wallet = wallet;
        return { wallet };
      });
    },

    /** Replace the garage wholesale (restore from an export). Backed up first. */
    replace(incoming) {
      if (!incoming || typeof incoming !== 'object' || typeof incoming.cars !== 'object') {
        throw new GarageError('Not a garage export: expected { cars: { ... } }');
      }
      const cars = {};
      const now = new Date().toISOString();
      for (const [id, record] of Object.entries(incoming.cars)) {
        if (!isKnownCar(Number(id))) continue;
        const merged = { ...EMPTY, ...cleanPatch({ ...EMPTY, ...record }) };
        if (record.ownedAt) merged.ownedAt = record.ownedAt;
        merged.updatedAt = record.updatedAt || now;
        if (!isDefault(merged)) cars[String(Number(id))] = merged;
      }
      lastBackupAt = 0; // always snapshot before a wholesale replace
      return mutate((s) => {
        s.cars = cars;
        if ('wallet' in incoming) s.wallet = Number.isFinite(incoming.wallet) ? incoming.wallet : null;
        return { cars: Object.keys(cars).length };
      });
    },
  };
}
