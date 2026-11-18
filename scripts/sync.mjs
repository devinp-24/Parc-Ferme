#!/usr/bin/env node
// npm run sync          refresh whatever is stale (normally just today's dealerships)
// npm run sync:full     re-read every source from scratch
//
// The server runs the same sync on its own (on start-up and every few hours),
// so this is only needed when the server is not running.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncer } from '../server/lib/sync/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../server/data');
const full = process.argv.includes('--full');

const syncer = createSyncer(dataDir);
try {
  const result = await syncer.run({ full, force: true, log: (line) => line && console.log(`· ${line}`) });
  if (!result.changed) {
    console.log(`Already up to date (dealership data for ${result.dealershipDate}).`);
  } else {
    console.log(
      `Catalogue rebuilt in ${result.seconds}s: ${result.cars} cars, dealership data for ${result.dealershipDate}.`
    );
    if (result.newCars.length) console.log(`New since last sync: ${result.newCars.length} car(s).`);
    for (const warning of result.warnings) console.warn(`! ${warning}`);
  }
} catch (error) {
  console.error(`Sync failed: ${error.message}`);
  process.exitCode = 1;
}
