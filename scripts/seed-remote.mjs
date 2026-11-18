// Copy a local garage onto a deployed server, once.
//
//   PARC_URL=https://your-app.up.railway.app PARC_TOKEN=<owner token> \
//   node scripts/seed-remote.mjs [path/to/server/data/garage.json]
//
// The catalogue is not sent: the server builds its own from the public
// sources on first start. Only what you own, shortlist and note travels.
import fs from 'node:fs/promises';

const BASE = (process.env.PARC_URL || '').replace(/\/$/, '');
const TOKEN = process.env.PARC_TOKEN || '';
const file = process.argv[2] || 'server/data/garage.json';
if (!BASE || !TOKEN) {
  console.error('Set PARC_URL and PARC_TOKEN first.');
  process.exit(1);
}
const garage = JSON.parse(await fs.readFile(file, 'utf8'));
const res = await fetch(`${BASE}/api/garage/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify(garage),
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const owned = Object.values(garage.cars || {}).filter((c) => c.owned).length;
console.log(`garage restored: ${owned} cars owned`);
