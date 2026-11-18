// Everything derived from (catalogue x garage): what you own, what is left,
// what it costs, and how the grid is cut. Pure functions, no platform imports.

import { daysBetween, formatDay, relativeDay, todayUtc } from './format.js';

export const DEALERS = {
  brand: { label: 'Brand Central', short: 'Brand Central', order: 0 },
  legend: { label: 'Legend Cars', short: 'Legend', order: 1 },
  used: { label: 'Used Cars', short: 'Used', order: 2 },
  dlc: { label: 'Power Pack DLC', short: 'DLC', order: 3 },
  reward: { label: 'Reward only', short: 'Reward', order: 4 },
  unknown: { label: 'Not for sale', short: 'Unknown', order: 5 },
};

export const CLASSES = ['Gr.1', 'Gr.2', 'Gr.3', 'Gr.4', 'Gr.B', 'Gr.N', 'Gr.X'];
export const CLASS_NOTES = {
  'Gr.1': 'Prototype racers',
  'Gr.2': 'GT500 / DTM',
  'Gr.3': 'GT3 racers',
  'Gr.4': 'GT4 racers',
  'Gr.B': 'Rally cars',
  'Gr.N': 'Road cars',
  'Gr.X': 'Specials & concepts',
};
export const REGIONS = ['Japan', 'Americas', 'Europe', 'Asia-Pacific', 'Other'];

export const REGISTERS = {
  garage: { label: 'Garage', short: 'Garage', hint: 'Cars you own' },
  missing: { label: 'Missing', short: 'Missing', hint: 'Every car you do not own yet' },
  shortlist: { label: 'Shortlist', short: 'Shortlist', hint: 'The ones you are saving for' },
  dealers: { label: 'In stock today', short: 'In stock', hint: "Today's Used Cars and Legend Cars stock" },
  all: { label: 'All cars', short: 'All cars', hint: 'Every car in the game, owned and not' },
};

export const SORTS = {
  name: { label: 'Name' },
  'price-desc': { label: 'Price, high to low' },
  'price-asc': { label: 'Price, low to high' },
  'pp-desc': { label: 'Performance points' },
  'power-desc': { label: 'Power' },
  'year-desc': { label: 'Newest first' },
  'year-asc': { label: 'Oldest first' },
  'leaving-soon': { label: 'Leaving soonest' },
};

export const GROUPS = {
  maker: { label: 'Manufacturer' },
  region: { label: 'Region' },
  class: { label: 'Class' },
  dealer: { label: 'Where to buy' },
  decade: { label: 'Decade' },
  none: { label: 'No grouping' },
};

export const NEW_CAR_DAYS = 21;

const EMPTY_RECORD = Object.freeze({ owned: false, shortlist: false, notes: '', priceOverride: null });

/** The price the totals use: your override if you set one, else the catalogue's. */
export function effectivePrice(car, record) {
  if (record && typeof record.priceOverride === 'number') return record.priceOverride;
  return typeof car.price === 'number' ? car.price : null;
}

/** catalogue cars + garage records -> one entry per car. */
export function joinGarage(cars, garageCars = {}, today = todayUtc()) {
  return cars.map((car) => {
    const record = garageCars[car.id] || EMPTY_RECORD;
    return {
      id: car.id,
      car,
      record,
      owned: Boolean(record.owned),
      shortlist: Boolean(record.shortlist) && !record.owned,
      price: effectivePrice(car, record),
      overridden: typeof record.priceOverride === 'number',
      isNew: Boolean(car.firstSeenAt) && daysBetween(car.firstSeenAt, today) <= NEW_CAR_DAYS,
    };
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function haystack(e) {
  const c = e.car;
  return [
    c.fullName,
    c.maker,
    c.carClass,
    c.year,
    c.drivetrain,
    c.aspiration,
    c.countryName,
    c.region,
    DEALERS[c.dealer]?.label,
    ...(c.rewards || []).map((r) => r.label),
    e.record.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Official names use a Japanese middle dot ("V･SPEC II"); people type a hyphen.
    .replace(/[･・·]/g, '-');
}

const searchCache = new WeakMap();
function matches(entry, terms) {
  let text = searchCache.get(entry.car);
  if (!text || entry.record.notes) {
    text = haystack(entry);
    if (!entry.record.notes) searchCache.set(entry.car, text);
  }
  return terms.every((t) => text.includes(t));
}

export function inRegister(entry, register) {
  switch (register) {
    case 'garage': return entry.owned;
    case 'missing': return !entry.owned;
    case 'shortlist': return entry.shortlist;
    case 'dealers': return Boolean(entry.car.stock);
    default: return true;
  }
}

export function filterEntries(entries, { register = 'all', query = '', classes = [], dealers = [], regions = [], inStock = false, onlyNew = false } = {}) {
  const terms = query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const cls = new Set(classes);
  const dl = new Set(dealers);
  const rg = new Set(regions);
  return entries.filter((e) => {
    if (!inRegister(e, register)) return false;
    if (cls.size && !cls.has(e.car.carClass)) return false;
    if (dl.size && !dl.has(e.car.dealer)) return false;
    if (rg.size && !rg.has(e.car.region)) return false;
    if (inStock && !e.car.stock) return false;
    if (onlyNew && !e.isNew) return false;
    if (terms.length && !matches(e, terms)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting and grouping
// ---------------------------------------------------------------------------

const byName = (a, b) => a.car.fullName.localeCompare(b.car.fullName, 'en', { numeric: true });
const nullsLast = (get, dir) => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (x === null || x === undefined) return y === null || y === undefined ? byName(a, b) : 1;
  if (y === null || y === undefined) return -1;
  return x === y ? byName(a, b) : (x - y) * dir;
};

const daysLeftKey = (e) => {
  const s = e.car.stock;
  if (!s || s.state === 'soldout') return null;
  return typeof s.daysLeft === 'number' ? s.daysLeft : 99;
};

export function sortEntries(entries, sort = 'name') {
  const list = [...entries];
  switch (sort) {
    case 'price-desc': return list.sort(nullsLast((e) => e.price, -1));
    case 'price-asc': return list.sort(nullsLast((e) => e.price, 1));
    case 'pp-desc': return list.sort(nullsLast((e) => e.car.pp, -1));
    case 'power-desc': return list.sort(nullsLast((e) => e.car.powerHp, -1));
    case 'year-desc': return list.sort(nullsLast((e) => e.car.year, -1));
    case 'year-asc': return list.sort(nullsLast((e) => e.car.year, 1));
    case 'leaving-soon': return list.sort(nullsLast(daysLeftKey, 1));
    default: return list.sort(byName);
  }
}

/** Totals for any set of entries. "Credits" always means: to buy what is missing. */
export function summarise(entries) {
  const out = {
    total: entries.length,
    owned: 0,
    missing: 0,
    credits: 0,
    unpriced: 0,
    free: 0,
    garageValue: 0,
    inStockMissing: 0,
    byDealer: {},
  };
  for (const e of entries) {
    if (e.owned) {
      out.owned += 1;
      if (typeof e.price === 'number') out.garageValue += e.price;
      continue;
    }
    out.missing += 1;
    if (e.car.stock && e.car.stock.state !== 'soldout') out.inStockMissing += 1;
    const bucket = (out.byDealer[e.car.dealer] ||= { count: 0, credits: 0, unpriced: 0 });
    bucket.count += 1;
    if (typeof e.price === 'number') {
      out.credits += e.price;
      bucket.credits += e.price;
      if (e.price === 0) out.free += 1;
    } else {
      out.unpriced += 1;
      bucket.unpriced += 1;
    }
  }
  return out;
}

const decadeOf = (year) => (year ? `${Math.floor(year / 10) * 10}s` : 'Undated');

export function groupEntries(entries, groupBy, makers = []) {
  if (groupBy === 'none') return [{ key: 'all', label: null, entries, stats: summarise(entries) }];
  const makerById = new Map(makers.map((m) => [m.id, m]));
  const buckets = new Map();
  for (const e of entries) {
    let key;
    switch (groupBy) {
      case 'region': key = e.car.region; break;
      case 'class': key = e.car.carClass || 'Unclassified'; break;
      case 'dealer': key = e.car.dealer; break;
      case 'decade': key = decadeOf(e.car.year); break;
      default: key = e.car.makerId;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }
  const groups = [...buckets.entries()].map(([key, list]) => {
    const g = { key: String(key), entries: list, stats: summarise(list) };
    if (groupBy === 'maker') {
      const m = makerById.get(key);
      g.label = m?.name || list[0].car.maker;
      g.sub = m?.countryName || list[0].car.countryName;
      g.logoMakerId = m?.logo ? key : null;
      g.order = g.label.toLowerCase();
    } else if (groupBy === 'dealer') {
      g.label = DEALERS[key]?.label || key;
      g.order = DEALERS[key]?.order ?? 9;
    } else if (groupBy === 'class') {
      g.label = key;
      g.sub = CLASS_NOTES[key] || null;
      g.order = CLASSES.indexOf(key) === -1 ? 99 : CLASSES.indexOf(key);
    } else if (groupBy === 'region') {
      g.label = key;
      g.order = REGIONS.indexOf(key) === -1 ? 99 : REGIONS.indexOf(key);
    } else {
      g.label = key;
      g.order = key === 'Undated' ? 'zzzz' : key;
    }
    return g;
  });
  return groups.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

/**
 * How long a car stays in today's dealership.
 *   text   short, for a label on the photo:  "Leaves tonight", "4 days left"
 *   long   names the dealership too:          "In Legend Cars, 4 days left"
 *   tone   urgent (leaves tonight or tomorrow), live, or muted (sold out)
 * gt7info's countdown is an estimate; daysLeft counts today, so 1 = last day.
 */
export function stockLabel(stock) {
  if (!stock) return null;
  const where = DEALERS[stock.dealer]?.label || 'the dealership';
  if (stock.state === 'soldout') return { text: 'Sold out', long: `Sold out in ${where}`, tone: 'muted' };
  let text;
  let tone = 'live';
  if (stock.daysLeft === null || stock.daysLeft === undefined) text = 'In stock';
  else if (stock.daysLeft <= 1) {
    text = 'Leaves tonight';
    tone = 'urgent';
  } else if (stock.daysLeft === 2) {
    text = 'Leaves tomorrow';
    tone = 'urgent';
  } else text = `${stock.daysLeft} days left`;
  const long = text === 'In stock' ? `In ${where} today` : `In ${where}, ${text.toLowerCase()}`;
  return { text, long, tone, isNew: Boolean(stock.isNew), limited: stock.state === 'limited' };
}

/** Where the price came from, in a few words, so you know how far to trust it. */
export function priceNote(entry, today = todayUtc()) {
  const c = entry.car;
  if (entry.overridden) return 'Your price';
  if (c.dealer === 'brand') return c.price === 0 ? 'Free at Brand Central' : 'Brand Central';
  if (c.dealer === 'dlc') return 'Power Pack DLC';
  if (c.priceKind === 'live') return `In ${DEALERS[c.dealer].label} today`;
  if (c.priceKind === 'last-seen') return `${DEALERS[c.dealer].label}, seen ${relativeDay(c.priceDate, today)}`;
  if (c.priceKind === 'estimate') return `${DEALERS[c.dealer].label}, wiki estimate`;
  if (c.dealer === 'reward') return 'Reward only';
  return 'Not for sale';
}

export function lastSeenText(seen) {
  if (!seen) return null;
  return `Seen ${seen.visits === 1 ? 'once' : `${seen.visits} times`} since ${formatDay(seen.firstSeen, { year: true })}`;
}
