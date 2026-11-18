// Source 1 of 3: gt7info (github.com/ddm999/gt7info, MIT-0 licensed).
//
// A community project that has recorded both rotating dealerships every day
// since March 2022. It is the backbone of the catalogue:
//
//   _data/db/cars.csv          every car ID in the game, updated as soon as an
//                              update adds cars -- this is how new cars arrive
//   _data/db/maker.csv         manufacturers, with their country
//   _data/db/country.csv
//   _data/db/cargrp.csv        Gr.1 / Gr.2 / Gr.3 / Gr.4 / Gr.B / N / X
//   _data/db/lotterycars.csv   which roulette tickets can award a car
//   _data/brandcentral/*.csv   Brand Central list prices (latest file wins)
//   _data/rewards/*.csv        menu book, licence, mission and transfer cars
//   _data/used/YY-MM-DD.csv    Used Car dealership stock, one file per day
//   _data/legend/YY-MM-DD.csv  Legend Cars dealership stock, one file per day
//
// The whole repository is read as one tarball rather than file by file: the
// history alone is ~3,400 CSVs, and a tarball is a single 13 MB request that
// also tells us which commit we read.

import { fetchBuffer, fetchText } from '../http.mjs';
import { parseCsv, readTarGz } from './parse.mjs';

const REPO = 'ddm999/gt7info';
const BRANCH = 'web-new';

/** The SHA at the tip of gt7info, or null if GitHub could not be asked. */
export async function latestGt7infoCommit() {
  try {
    const sha = await fetchText(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
      headers: { Accept: 'application/vnd.github.sha' },
      retries: 1,
      timeoutMs: 15_000,
    });
    return /^[0-9a-f]{40}$/i.test(sha.trim()) ? sha.trim() : null;
  } catch {
    return null;
  }
}

export async function fetchGt7info() {
  const gz = await fetchBuffer(`https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`, {
    timeoutMs: 180_000,
  });
  const { files, globalHeader } = readTarGz(gz);
  const texts = new Map();
  for (const file of files) {
    // Entries are prefixed with "gt7info-web-new/".
    const rel = file.path.replace(/^[^/]+\//, '');
    if ((rel.startsWith('_data/') && rel.endsWith('.csv')) || rel === 'images.txt') {
      texts.set(rel, file.data.toString('utf8'));
    }
  }
  const commit = /^[0-9a-f]{40}$/i.test(globalHeader.comment || '') ? globalHeader.comment : null;
  return parseGt7info(texts, commit);
}

// images.txt maps Polyphony's companion-app assets to their hashed URLs. The
// "_m_w" logos are the white versions, made for dark backgrounds.
const COMPANION_IMAGES = 'https://www.gran-turismo.com/common/dist/gt7/companion/';

function parseLogos(text) {
  const logos = {};
  if (!text) return logos;
  for (const line of text.split('\n')) {
    const m = line.match(/tuner_logo_m_w\/tnr(\d+)\.png\s*-\s*(images\/[0-9a-f]+\.png)/i);
    if (m) logos[Number(m[1])] = `${COMPANION_IMAGES}${m[2]}`;
  }
  return logos;
}

const DATE_FILE = /^(\d{2})-(\d{2})-(\d{2})\.csv$/;

/** "26-11-14" -> "2026-11-14". gt7info's history starts in 2022, so 20xx is safe. */
export const isoFromGt7Date = (yymmdd) => `20${yymmdd}`;

function filesIn(texts, dir) {
  return [...texts.keys()]
    .filter((k) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
    .sort();
}

export function parseGt7info(texts, commit = null) {
  const table = (rel) => parseCsv(texts.get(rel) ?? '');
  const latest = (dir) => {
    // v111.csv, v112.csv, v154.csv ... sorted numerically, not lexically.
    const versions = filesIn(texts, dir).sort((a, b) => {
      const n = (s) => Number((s.match(/v(\d+)\.csv$/) || [])[1] || 0);
      return n(a) - n(b);
    });
    const file = versions[versions.length - 1];
    return file ? { file, rows: table(file) } : { file: null, rows: [] };
  };

  const cars = table('_data/db/cars.csv')
    .map((r) => ({ id: Number(r.ID), shortName: r.ShortName, makerId: Number(r.Maker) }))
    .filter((c) => Number.isFinite(c.id) && c.shortName);

  const makers = table('_data/db/maker.csv').map((r) => ({
    id: Number(r.ID),
    name: r.Name,
    countryId: Number(r.Country),
  }));

  const countries = table('_data/db/country.csv').map((r) => ({
    id: Number(r.ID),
    name: r.Name,
    code: r.Code,
  }));

  const groups = Object.fromEntries(table('_data/db/cargrp.csv').map((r) => [Number(r.ID), r.Group]));

  const lottery = {};
  for (const r of table('_data/db/lotterycars.csv')) lottery[Number(r.CarID)] = r.Category;

  const bc = latest('_data/brandcentral');
  const brandCentral = Object.fromEntries(bc.rows.map((r) => [Number(r.id), Number(r.cr)]));

  const rw = latest('_data/rewards');
  const rewards = {};
  for (const r of rw.rows) {
    const id = Number(r.rewardcar);
    if (!Number.isFinite(id)) continue;
    (rewards[id] ||= []).push({ type: r.type, detail: r.specific, requirement: r.trophy === '-' ? null : r.trophy });
  }

  // Daily dealership snapshots, oldest first.
  const snapshots = {};
  for (const dealer of ['used', 'legend']) {
    snapshots[dealer] = filesIn(texts, `_data/${dealer}`)
      .map((file) => {
        const name = file.slice(file.lastIndexOf('/') + 1);
        const m = name.match(DATE_FILE);
        if (!m) return null; // starter.csv, menubook.csv
        const rows = table(file)
          .map((r) => ({
            id: Number(r.id),
            cr: Number(r.cr),
            state: r.state || 'normal',
            daysRemaining: r.daysremaining === undefined || r.daysremaining === '' ? null : Number(r.daysremaining),
          }))
          .filter((r) => Number.isFinite(r.id) && Number.isFinite(r.cr));
        return { date: isoFromGt7Date(`${m[1]}-${m[2]}-${m[3]}`), rows };
      })
      .filter(Boolean);
  }

  return {
    commit,
    brandCentralFile: bc.file,
    rewardsFile: rw.file,
    logos: parseLogos(texts.get('images.txt')),
    cars,
    makers,
    countries,
    groups,
    lottery,
    brandCentral,
    rewards,
    snapshots,
  };
}
