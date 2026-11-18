#!/usr/bin/env node
// shared/tokens.js -> app/src/styles/tokens.css   (npm run tokens)
// An optional path argument writes somewhere else instead.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tokens from '../shared/tokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, '../app/src/styles/tokens.css'));

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const px = (v) => (typeof v === 'number' ? `${v}px` : v);
const block = (title, prefix, entries) => [
  `  /* ${title} */`,
  ...Object.entries(entries).map(([k, v]) => `  --${prefix}${kebab(k)}: ${px(v)};`),
  '',
];

const lines = [
  '/* GENERATED FILE — do not edit.',
  ' * Source: shared/tokens.js',
  ' * Rebuild: npm run tokens',
  ' */',
  '',
  ':root {',
  ...block('Colour', '', tokens.colors),
  ...block('Radii', 'radius-', tokens.radius),
  ...block('Spacing', 'space-', tokens.spacing),
  ...block('Type', 'font-', tokens.fonts),
  ...block('Widths', 'width-', tokens.widths),
  ...block('Motion', 'motion-', tokens.motion),
  '}',
  '',
];

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, lines.join('\n'));
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
