// Source 2 of 3: Polyphony's own GT7 car list (gran-turismo.com/us/gt7/carlist).
//
// Supplies what gt7info does not: the spec sheet (class, PP, power, torque,
// weight, drivetrain, aspiration, dimensions) and the photography -- a studio
// shot, a location shot and an interior for every car, at 1920x1080.
//
// The page is a single-page app. Its data lives in hashed JavaScript chunks
// whose names change on every deploy, so nothing here is hardcoded except the
// page URL: the sync loads the page, finds the entry script, and reads the
// chunk names out of it. Car IDs are the same numbers gt7info uses
// (`car102` == 102), which is what lets the two sources join without guessing.

import { fetchText } from '../http.mjs';
import { parseJsLiteral } from './parse.mjs';

export const OFFICIAL_ORIGIN = 'https://www.gran-turismo.com';
const PAGE_URL = `${OFFICIAL_ORIGIN}/us/gt7/carlist/`;

const assetUrl = (base, name) => new URL(name, base).href;

function findChunk(indexJs, spec) {
  // "../generated-assets/data/catalog/cars.us.ts":()=>H(()=>import(`./cars.us-s8yrE2qF.js`),[])
  const escaped = spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const m = indexJs.match(new RegExp(`${escaped}"\\s*:\\s*\\(\\)\\s*=>[^\`]{0,80}\`\\./([^\`]+\\.js)\``));
  return m ? m[1] : null;
}

async function fetchEntry() {
  const html = await fetchText(PAGE_URL);
  const entry = html.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/);
  if (!entry) throw new Error('Could not find the car list entry script on the official page');
  const indexUrl = new URL(entry[1], OFFICIAL_ORIGIN).href;
  const indexJs = await fetchText(indexUrl, { timeoutMs: 60_000 });
  return { indexUrl, indexJs };
}

function imageChunksFrom(indexJs) {
  // Photo chunks: one tiny module per image, mapping to the hashed .jpg URL.
  // Only the 2k set is indexed (1920x1080 is already far larger than any
  // place the app shows a photo).
  const imageChunks = {};
  const re = /car_shots\/2k\/(car\d+_\d+_\d+)\.jpg"\s*:\s*\(\)\s*=>[^`]{0,80}`\.\/([^`]+\.js)`/g;
  for (const m of indexJs.matchAll(re)) imageChunks[m[1]] = m[2];
  return imageChunks;
}

/** Just the photo index -- two requests. Used when a deploy has renamed the chunks. */
export async function fetchOfficialImageIndex() {
  const { indexUrl, indexJs } = await fetchEntry();
  return { indexUrl, chunks: imageChunksFrom(indexJs) };
}

export async function fetchOfficial({ language = 'us' } = {}) {
  const { indexUrl, indexJs } = await fetchEntry();

  const chunkNames = {
    cars: findChunk(indexJs, `data/catalog/cars.${language}.ts`),
    tuners: findChunk(indexJs, `data/catalog/tuners.${language}.ts`),
    countries: findChunk(indexJs, `data/catalog/countries.${language}.ts`),
  };
  const shotsIndex = indexJs.match(/import\(`\.\/(car-shots-index-[^`]+\.js)`\)/);
  chunkNames.shots = shotsIndex ? shotsIndex[1] : null;
  for (const [key, name] of Object.entries(chunkNames)) {
    if (!name) throw new Error(`Could not find the "${key}" data chunk in the official car list bundle`);
  }

  const [carsJs, tunersJs, countriesJs, shotsJs] = await Promise.all(
    [chunkNames.cars, chunkNames.tuners, chunkNames.countries, chunkNames.shots].map((name) =>
      fetchText(assetUrl(indexUrl, name), { timeoutMs: 60_000 })
    )
  );

  const rawCars = parseJsLiteral(carsJs);
  const tuners = parseJsLiteral(tunersJs);
  const countries = parseJsLiteral(countriesJs);
  const shots = parseJsLiteral(shotsJs);

  const imageChunks = imageChunksFrom(indexJs);

  const num =(v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.parseFloat(v));
  const cars = {};
  for (const car of Object.values(rawCars)) {
    const id = Number(String(car.id).replace(/^car/, ''));
    if (!Number.isFinite(id)) continue;
    const pp = Number.parseFloat(String(car.performancePoint || '').replace(/[^\d.]/g, ''));
    cars[id] = {
      id,
      nameLong: car.nameLong,
      nameShort: car.nameShort,
      makerId: Number(String(car.manufacturerId || '').replace(/^tnr/, '')) || null,
      countryId: Number(String(car.countryId || '').replace(/^carctry/, '')) || null,
      carClass: car.carClass || null,
      pp: Number.isFinite(pp) ? pp : null,
      powerHp: num(car.power_v) || null,
      torqueFtLb: num(car.torque_v) || null,
      weightLbs: num(car.weight_v) || null,
      maxPower: car.maxPower || null,
      maxTorque: car.maxTorque || null,
      drivetrain: car.driveTrain || null,
      aspiration: car.aspirationShort || null,
      aspirationLong: car.aspirationLong || null,
      displacementCc: num(car.displacement_v) || null,
      lengthIn: num(car.length_v) || null,
      widthIn: num(car.width_v) || null,
      heightIn: num(car.height_v) || null,
      shots: (shots[`car${id}`] || []).map((f) => String(f).replace(/^car\d+_/, '').replace(/\.jpg$/, '')),
    };
  }

  const makers = {};
  for (const t of Object.values(tuners)) {
    const id = Number(String(t.id).replace(/^tnr/, ''));
    if (Number.isFinite(id)) makers[id] = String(t.name || '').trim();
  }

  return {
    fetchedAt: new Date().toISOString(),
    indexUrl,
    cars,
    makers,
    countries,
    imageChunks,
  };
}

/** Resolve one photo chunk (e.g. "car102_2_01-MvXbDuCc.js") to its .jpg URL. */
export async function resolveImageChunk(indexUrl, chunkName) {
  const js = await fetchText(assetUrl(indexUrl, chunkName), { timeoutMs: 20_000, retries: 1 });
  const m = js.match(/`([^`]+\.(?:jpe?g|png|webp))`|"([^"]+\.(?:jpe?g|png|webp))"/);
  if (!m) throw new Error(`No image URL in ${chunkName}`);
  return new URL(m[1] || m[2], OFFICIAL_ORIGIN).href;
}
