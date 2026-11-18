// Non-component exports live here rather than beside components: a file that
// exports both a component and anything else cannot be hot-reloaded by Vite.

import { useEffect, useState } from 'react';

export const EMPTY_FILTERS = { classes: [], dealers: [], regions: [], inStock: false, onlyNew: false };

export const countFilters = (f) =>
  f.classes.length + f.dealers.length + f.regions.length + (f.inStock ? 1 : 0) + (f.onlyNew ? 1 : 0);

function untilRotation(now = Date.now()) {
  // Both dealerships rotate at 00:00 UTC.
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const mins = Math.max(0, Math.round((next - now) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const unit = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return {
    short: h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`,
    long: h ? `${unit(h, 'hour')} ${unit(m, 'minute')}` : unit(m, 'minute'),
  };
}

/** Time until the dealerships rotate, refreshed every 30 seconds. */
export function useRotationCountdown() {
  const [value, setValue] = useState(untilRotation);
  useEffect(() => {
    const id = setInterval(() => setValue(untilRotation()), 30_000);
    return () => clearInterval(id);
  }, []);
  return value;
}
