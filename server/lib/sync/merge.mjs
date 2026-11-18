// Three sources in, one catalogue out.
//
// Every car is keyed by the game's own car ID, which all three sources share
// (gt7info by number, the official list as `car102`, the wiki by page title
// resolved from the official name). gt7info's roster is the master list
// because it is the fastest to pick up new cars.
//
// Where the sources disagree, the rule is "whoever measured it most recently":
//
//   Brand Central list price  wiki first. gt7info's list is frozen at game
//                             version 1.12; the two agree on 289 of 295 cars and
//                             every disagreement is a later price change.
//   Used / Legend price       gt7info first. It records the exact price on the
//                             exact day; the wiki only says "180,000 or less".
//   Specs and photos          official list only.

const CLASS_FROM_GROUP = { 1: 'Gr.1', 2: 'Gr.2', 3: 'Gr.3', 4: 'Gr.4', B: 'Gr.B', N: 'Gr.N', X: 'Gr.X' };

// Brand Central groups makers by region; so does this.
const REGION_BY_COUNTRY = {
  jp: 'Japan',
  us: 'Americas', ca: 'Americas', br: 'Americas',
  gb: 'Europe', de: 'Europe', fr: 'Europe', it: 'Europe', se: 'Europe', es: 'Europe',
  at: 'Europe', ch: 'Europe', be: 'Europe', cz: 'Europe', hr: 'Europe', nl: 'Europe', dk: 'Europe',
  kr: 'Asia-Pacific', cn: 'Asia-Pacific', au: 'Asia-Pacific', ae: 'Asia-Pacific',
};

/**
 * "Skyline GTS-R (R31) '87" -> 1987, "1932 Ford Roadster" -> 1932.
 * Names without a year (most VGTs and Gr. race cars) -> null.
 */
export function yearFromName(name) {
  const text = String(name || '');
  const short = text.match(/'(\d{2})(?!\d)/);
  if (short) {
    const yy = Number(short[1]);
    const cutoff = (new Date().getUTCFullYear() % 100) + 1;
    return yy <= cutoff ? 2000 + yy : 1900 + yy;
  }
  const full = text.match(/\b(19[0-9]{2}|20[0-4][0-9])\b/);
  return full ? Number(full[1]) : null;
}

const LOTTERY = {
  S: '1–4★ roulette tickets',
  M: '3–5★ roulette tickets',
  L: '4–6★ roulette tickets',
  B: 'Birthday gift',
};

function describeReward(r) {
  const req = r.requirement ? ` (${r.requirement[0].toUpperCase()}${r.requirement.slice(1)})` : '';
  switch (r.type) {
    case 'menubook': return { type: 'menubook', label: `Menu Book ${r.detail}` };
    case 'license': return { type: 'license', label: `Licence ${r.detail}${req}` };
    case 'mission': return { type: 'mission', label: `Mission: ${r.detail}${req}` };
    case 'transfer': return { type: 'transfer', label: `Transfer from ${r.detail}${req}` };
    default: return { type: r.type, label: [r.type, r.detail].filter(Boolean).join(' ') };
  }
}

/**
 * Collapse daily snapshots into stints: consecutive days a car sat in a
 * dealership at one price. ~70,000 daily rows become a few thousand stints.
 */
export function buildHistory(snapshots) {
  const history = {};
  for (const dealer of ['used', 'legend']) {
    const days = snapshots[dealer] || [];
    const open = new Map(); // id -> { stint, lastIndex }
    days.forEach((day, index) => {
      for (const row of day.rows) {
        const current = open.get(row.id);
        const continues = current && current.lastIndex === index - 1;
        if (continues && current.stint[3] === row.cr) {
          current.stint[2] = day.date;
          current.stint[4] = row.state;
          current.lastIndex = index;
          continue;
        }
        // [dealer, from, to, credits, state, continuesPrevious]
        const stint = [dealer, day.date, day.date, row.cr, row.state, continues ? 1 : 0];
        (history[row.id] ||= []).push(stint);
        open.set(row.id, { stint, lastIndex: index });
      }
    });
  }
  return history;
}

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function summariseHistory(stints) {
  if (!stints || stints.length === 0) return null;
  const visits = [];
  for (const s of stints) {
    if (s[5] && visits.length) {
      const v = visits[visits.length - 1];
      v.to = s[2];
      v.cr = s[3];
      v.state = s[4];
    } else {
      visits.push({ dealer: s[0], from: s[1], to: s[2], cr: s[3], state: s[4] });
    }
  }
  const prices = stints.map((s) => s[3]);
  const last = visits[visits.length - 1];
  const stays = visits.map((v) => dayDiff(v.from, v.to) + 1);
  return {
    dealer: last.dealer,
    visits: visits.length,
    firstSeen: visits[0].from,
    lastSeen: last.to,
    lastCr: last.cr,
    minCr: Math.min(...prices),
    maxCr: Math.max(...prices),
    avgStay: Math.round(stays.reduce((a, b) => a + b, 0) / stays.length),
  };
}

function classifyDealer({ wiki, inBcList, seen, rewards, lottery }) {
  const wd = (wiki && wiki.dealership) || '';
  if (/brand central/i.test(wd) || inBcList) return 'brand';
  if (seen?.dealer === 'legend' || /legend/i.test(wd)) return 'legend';
  if (seen?.dealer === 'used' || /used/i.test(wd)) return 'used';
  if (/power pack|dlc/i.test(wd)) return 'dlc';
  if (rewards.length || lottery || wiki?.otherMethods) return 'reward';
  return 'unknown';
}

export function buildCatalogue({ gt7info, official, wiki, previous = null, now = new Date() }) {
  const logos = gt7info.logos || {};
  const nowIso = now.toISOString();
  const makersById = new Map(gt7info.makers.map((m) => [m.id, m]));
  const countriesById = new Map(gt7info.countries.map((c) => [c.id, c]));
  const prevById = new Map((previous?.cars || []).map((c) => [c.id, c]));
  const firstSync = !previous;

  const historyStints = buildHistory(gt7info.snapshots);

  // Today's stock is the newest snapshot in each dealership.
  const stock = {};
  const stockDates = {};
  for (const dealer of ['used', 'legend']) {
    const latest = gt7info.snapshots[dealer]?.at(-1);
    if (!latest) continue;
    stockDates[dealer] = latest.date;
    for (const row of latest.rows) {
      stock[row.id] = {
        dealer,
        cr: row.cr,
        state: row.state,
        isNew: row.state === 'new',
        // gt7info's countdown: 2 = last day, 3 = one more day, -1 = no
        // estimate (a car Polyphony pushed in by hand). Stored as days left
        // including today, so 1 means "last day".
        daysLeft: typeof row.daysRemaining === 'number' && row.daysRemaining > 0 ? row.daysRemaining - 1 : null,
        date: latest.date,
      };
    }
  }

  const cars = gt7info.cars.map((g) => {
    const o = official?.cars?.[g.id] || null;
    const w = wiki?.[g.id] && !wiki[g.id].missing ? wiki[g.id] : null;
    const maker = makersById.get(g.makerId);
    const country = countriesById.get(maker?.countryId);
    const code = country?.code || 'pdi';
    const rewards = (gt7info.rewards[g.id] || []).map(describeReward);
    const lottery = gt7info.lottery[g.id] || null;
    const seen = summariseHistory(historyStints[g.id]);
    const bcList = gt7info.brandCentral[g.id] ?? null;
    const dealer = classifyDealer({ wiki: w, inBcList: bcList !== null, seen, rewards, lottery });
    const today = stock[g.id] || null;

    // Price resolution -- one figure the totals can add up, plus where it came
    // from so the interface can say how much to trust it.
    let price = null;
    let priceKind = null;
    let priceDate = null;
    if (dealer === 'brand') {
      const wikiBc = /brand central/i.test(w?.dealership || '') ? w?.credits : null;
      price = wikiBc ?? bcList;
      priceKind = price !== null ? 'list' : null;
    } else if (dealer === 'legend' || dealer === 'used') {
      if (today && today.state !== 'soldout') {
        price = today.cr;
        priceKind = 'live';
        priceDate = today.date;
      } else if (seen) {
        price = seen.lastCr;
        priceKind = 'last-seen';
        priceDate = seen.lastSeen;
      } else if (w?.credits) {
        price = w.credits;
        priceKind = 'estimate';
      }
    } else if (dealer === 'dlc') {
      price = w?.credits ?? null;
      priceKind = price !== null ? 'list' : null;
    }

    const prev = prevById.get(g.id);
    const name = o?.nameShort || g.shortName;
    const fullName = o?.nameLong || [maker?.name, g.shortName].filter(Boolean).join(' ');
    return {
      id: g.id,
      name,
      fullName,
      makerId: g.makerId,
      maker: maker?.name || official?.makers?.[g.makerId] || 'Unknown',
      country: code,
      countryName: country?.name || 'Other',
      region: REGION_BY_COUNTRY[code] || 'Other',
      year: yearFromName(name) ?? yearFromName(fullName),
      carClass: o?.carClass || CLASS_FROM_GROUP[gt7info.groups[g.id]] || null,
      pp: o?.pp ?? null,
      powerHp: o?.powerHp ?? null,
      torqueFtLb: o?.torqueFtLb ?? null,
      weightLbs: o?.weightLbs ?? null,
      maxPower: o?.maxPower ?? null,
      maxTorque: o?.maxTorque ?? null,
      drivetrain: o?.drivetrain ?? null,
      aspiration: o?.aspiration ?? null,
      aspirationLong: o?.aspirationLong ?? null,
      displacementCc: o?.displacementCc ?? null,
      lengthIn: o?.lengthIn ?? null,
      widthIn: o?.widthIn ?? null,
      heightIn: o?.heightIn ?? null,
      shots: o?.shots || [],

      dealer,
      price,
      priceKind,
      priceDate,
      bcPrice: dealer === 'brand' ? price : null,
      wikiCredits: w?.credits ?? null,
      wikiCreditsApprox: Boolean(w?.approx),
      seen,
      stock: today,
      rewards,
      lottery: lottery ? { tier: lottery, label: LOTTERY[lottery] || lottery } : null,
      otherMethods: w?.otherMethods || null,
      addedInUpdate: w?.update || null,
      wikiTitle: w?.title || null,

      // When this tracker first saw the car. Null for the baseline sync, so
      // a fresh install does not flag all 590 cars as new.
      firstSeenAt: prev ? prev.firstSeenAt ?? null : firstSync ? null : nowIso,
    };
  });

  // Makers, with official logos where gt7info knows them.
  const carCountByMaker = new Map();
  for (const c of cars) carCountByMaker.set(c.makerId, (carCountByMaker.get(c.makerId) || 0) + 1);
  const makers = gt7info.makers
    .filter((m) => carCountByMaker.has(m.id))
    .map((m) => {
      const country = countriesById.get(m.countryId);
      return {
        id: m.id,
        name: m.name,
        country: country?.code || 'pdi',
        countryName: country?.name || 'Other',
        region: REGION_BY_COUNTRY[country?.code] || 'Other',
        logo: logos[m.id] || null,
        cars: carCountByMaker.get(m.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const latestDealership = [stockDates.used, stockDates.legend].filter(Boolean).sort().at(-1) || null;
  const newCars = cars.filter((c) => c.firstSeenAt === nowIso).map((c) => c.id);

  return {
    catalogue: {
      version: 1,
      generatedAt: nowIso,
      dealershipDate: latestDealership,
      stockDates,
      sources: {
        gt7info: {
          commit: gt7info.commit,
          brandCentralFile: gt7info.brandCentralFile,
          rewardsFile: gt7info.rewardsFile,
          firstSnapshot: gt7info.snapshots.used?.[0]?.date || null,
        },
        official: official ? { fetchedAt: official.fetchedAt, cars: Object.keys(official.cars).length } : null,
        wiki: wiki ? { matched: Object.values(wiki).filter((w) => !w.missing).length } : null,
      },
      newCars,
      makers,
      cars,
    },
    history: historyStints,
  };
}
