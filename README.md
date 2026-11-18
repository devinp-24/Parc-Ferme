# Parc Fermé

A collection register for Gran Turismo 7. Every car in the game, which ones you
own, which ones you are missing, what each costs, and what it would take to
finish any collection you care about: a manufacturer, a class, a region, or the
whole game. Built on the same bones as The Stockroom (the shoe tracker).

**Live (read-only):** _link added after deploy_. Built with Claude, which had
the first version running in under an hour.

## The design, in one paragraph

Colour is earned. The interface is black, white and grey, and the colour on the
page comes from the cars you own: a car you do not own is grey, as in GT7's own
Collection, and turns to colour when it is yours. The one bold element is the
rev counter: collection completion is the needle, it does an ignition sweep on
load, and the redline (the last tenth) is the only red on the page, along with a
car that leaves a dealership tonight. One typeface, Mona Sans, at three widths:
condensed on the dial, regular for text, wide for headings. Numbers sit in
sentences or on the instrument, labels are sentence case, and nothing is
decorative unless it carries information. The tokens live in `shared/tokens.js`.

## Run it

Needs Node 18.17 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5177>. The first start builds the catalogue (about fifteen
seconds); after that it opens instantly.

For everyday use, build once and run a single process:

```bash
npm run build
npm start          # http://localhost:8797 serves the app and the API
```

On your phone (same Wi-Fi), start the server with `HOST=0.0.0.0 npm start` and
open `http://<your-mac's-ip>:8797`. It is localhost-only by default because the
API has no login.

## First job: the roll call

GT7 cannot export your garage, so the app starts empty. Press **Roll call**: makers
down the left, that maker's cars on the right. Go through it alongside the game's
own Collection screen. Every tick saves immediately.

| Key | Does |
| --- | --- |
| ↑ ↓ | move between cars |
| Space | tick / untick |
| ← → | previous / next maker |
| / | search every car |

After that, use **Own it** on any car, or **Add to garage** in a car's detail view
(the `O` key there; `S` shortlists).

## The views

| View | Shows |
| --- | --- |
| Garage | what you own; the ledger shows its total value |
| Missing | everything you do not own; the ledger shows the credits to finish |
| Shortlist | the cars you have starred; the ledger totals just those |
| In stock today | today's Used Cars and Legend Cars stock, cars you need first, with countdowns |
| Full roster | all cars; ones you do not own are greyed out, as in GT7's own Collection |

Filter by class, dealership, region, "in a dealership today" or "new since the last
update", group by manufacturer, region, class, dealership or decade, and the
ledger at the bottom totals whatever you are looking at. Put your current
credits in **Wallet** and it tells you how short you are.

## Where the data comes from, and how it stays current

No API key, no quota. Three public sources are merged by the game's own car ID,
which all three share:

| Source | Gives us | Refreshed |
| --- | --- | --- |
| [gt7info](https://github.com/ddm999/gt7info) (MIT-0) | every car ID in the game, makers, Brand Central prices, rewards, roulette tickets, and **every day's Used and Legend dealership stock since March 2022** | daily; downloaded only when its commit changes |
| [gran-turismo.com car list](https://www.gran-turismo.com/us/gt7/carlist/) | specs (class, PP, power, torque, weight, drivetrain…) and Polyphony's photography | weekly, or as soon as gt7info lists a car it does not have |
| [Gran Turismo Wiki](https://gran-turismo.fandom.com/) (CC BY-SA) | current Brand Central prices for the ~100 cars added after gt7info's price list was frozen at v1.12, Power Pack DLC cars, and other ways to obtain each car | every two weeks; new cars immediately |

Prices are resolved per car, and the app always says where a number came from:

- **Brand Central**: list price (wiki first, gt7info as fallback; they agree on 289 of 295 cars, and every difference is a later price change).
- **Used / Legend**: today's price if it is in stock, otherwise the exact price it was last seen at, with the date. Each car's detail view charts every stint it has spent in the dealership since 2022.
- **Your override** beats both, for when the game shows something different.

**New cars from game updates** arrive by themselves. gt7info adds new car IDs
within a day or so; the next sync picks them up, re-reads the official list for
their specs, looks up their prices, tags them **New**, and offers a "New since
last update" filter. A car Polyphony has not photographed yet shows a silhouette
until the official list catches up.

**Daily rotation.** Both dealerships change at 00:00 UTC. While the server runs it
checks hourly once that rotation is due, and the open app picks up the new stock
without a reload. The sync chip under the gauge shows which day's stock you are
looking at; click it to check now. With the server stopped, `npm run sync` does
the same from the command line (`npm run sync:full` re-reads everything).

A normal daily sync takes about three seconds.

## Your data

Your garage (owned, shortlist, notes, price overrides, wallet) lives in
`server/data/garage.json`. The sync never reads or writes it. Every save is
atomic, a snapshot is kept in `server/data/backups/` before changes (at most one
every ten minutes, last 40 kept), and **Export garage / Import garage** in the
page footer give you a portable copy.

Everything else in `server/data/` is generated and can be deleted: the next start
rebuilds it.

## Layout

```
shared/            pure logic + design tokens, usable by a future mobile app
  tokens.js        the design tokens (npm run tokens regenerates the CSS)
  collection.js    filtering, sorting, grouping, the credits maths
  format.js
server/
  server.js        Express API (+ serves dist/ in production)
  lib/store.mjs    the garage: queued, atomic, backed-up writes
  lib/images.mjs   official photos → cached WebP at 320 / 800 / 1600 px
  lib/sync/        gt7info.mjs, official.mjs, wiki.mjs → merge.mjs → catalogue
app/               Vite + React frontend
scripts/           sync.mjs, build-tokens.mjs
.claude/skills/    design skills, loaded by Claude Code sessions in this folder:
  design-taste-frontend   tasteskill 2.5.1 (Leonxlnx/taste-skill, MIT); its
                          checker scripts need Node 22+
  frontend-design         Anthropic's frontend-design skill (Apache-2.0)
  ui-ux-pro-max           copied from the shoe project
```

`PARC_DATA_DIR=/some/folder npm run dev` runs against a different data folder,
for example a copy to try changes on without touching your real garage.

## API

| Route | |
| --- | --- |
| `GET /api/catalogue` | every car with prices, specs, today's stock |
| `GET /api/history/:id` | a car's dealership stints since 2022 |
| `GET /api/garage` | your garage |
| `PATCH /api/garage/cars/:id` | `{ owned, shortlist, notes, priceOverride }` |
| `POST /api/garage/bulk` | `{ ids: [...], patch: {...} }` |
| `PUT /api/garage/wallet` | `{ wallet }` |
| `GET /api/garage/export` · `POST /api/garage/import` | backup / restore |
| `POST /api/sync` | `{ full?: true }` |
| `GET /api/sync/status` | |
| `GET /api/images/car/:id/:shot?w=` | official photo, cached |
| `GET /api/images/logo/:makerId` | manufacturer logo, cached |

## Deploy

One Railway service: `npm ci --include=dev && npm run build`, then `npm start`.

| Variable | Purpose |
| --- | --- |
| `ADMIN_TOKEN` | a long random secret: without it, the public copy is read-only |
| `PARC_DATA_DIR` | a mounted volume (e.g. `/data`) so the garage survives redeploys |
| `HOST` | `0.0.0.0` so the platform can reach the server |

The catalogue builds itself from the public sources on first start. Copy your
garage up once with `PARC_URL=... PARC_TOKEN=... npm run seed`.
[collections-mcp](https://github.com/devinp-24/collections-mcp) reads it
through `GET /api/summary` and the garage routes.

## What I would harden next

- **Auth:** one shared owner token; next would be real sign-in and scoped tokens per client.
- **Sync resilience:** if the wiki is unreachable during a sync, the cars it prices drop to "unpriced" until
  the next good sync. The sync should keep the last known value instead.
- **Photos:** Polyphony's photography is cached and served for a fan tool. A wider audience would mean
  hotlinking it or asking permission.

## Ports and versions

The API listens on 8797 (`API_PORT` to change it) and the dev frontend on 5177.
These are deliberately not the shoe tracker's 8787 / 5173, so both apps can run
at once.

This machine runs Node 18.19, so dependencies are pinned to the newest releases
that support it: Vite 6 (Vite 7+ needs Node 20) and sharp 0.34 (0.35 needs
Node 20.9). After upgrading Node they can move up.

---

A fan-made tool. Not affiliated with Polyphony Digital or Sony Interactive
Entertainment. Car photography and logos are Polyphony's, fetched from their
public car list and cached locally for personal use.
