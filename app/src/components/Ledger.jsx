import { useCanEdit } from '../lib/owner.js';
import { useEffect, useRef, useState } from 'react';
import { DEALERS, formatCompact, formatCredits } from '@shared';

// The running total, docked at the bottom: whatever the grid is showing, this
// is what it would cost to finish -- and, with your balance in, whether you
// can. In the garage it becomes what the garage is worth.

function useRolling(value, ms = 650) {
  // The figure rolls between totals like an odometer, so a change of filter
  // reads as the number moving rather than being swapped.
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof value !== 'number') {
      setShown(value);
      from.current = value;
      return undefined;
    }
    const start = performance.now();
    const a = typeof from.current === 'number' ? from.current : 0;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return shown;
}

function WalletField({ wallet, onWallet }) {
  const [draft, setDraft] = useState(wallet ? formatCredits(wallet) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(wallet ? formatCredits(wallet) : '');
  }, [wallet, focused]);
  const commit = () => {
    const digits = draft.replace(/[^\d]/g, '');
    const next = digits ? Number(digits) : null;
    if (next !== wallet) onWallet(next);
  };
  return (
    <label className="wallet">
      <span>Your credits</span>
      <input
        value={draft}
        inputMode="numeric"
        placeholder="0"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

const ORDER = ['brand', 'legend', 'used', 'dlc', 'reward', 'unknown'];

export default function Ledger({ register, scope, stats, wallet, onWallet }) {
  const canEdit = useCanEdit();
  const garageMode = register === 'garage';
  const figure = garageMode ? stats.garageValue : stats.credits;
  const rolled = useRolling(figure);

  if (stats.total === 0) return null;

  const cars = garageMode ? stats.owned : stats.missing;
  const lead = garageMode ? 'Garage value' : register === 'dealers' ? 'To buy what you need' : 'To finish';
  const breakdown = ORDER.map((k) => [k, stats.byDealer[k]]).filter(([, b]) => b && b.count > 0);

  let walletNote = null;
  if (!garageMode && typeof wallet === 'number' && stats.missing > 0) {
    const gap = stats.credits - wallet;
    walletNote =
      gap > 0 ? (
        <span className="wallet-note">Short by Cr. {formatCompact(gap)}</span>
      ) : (
        <span className="wallet-note is-covered">Covered, Cr. {formatCompact(-gap)} to spare</span>
      );
  }

  return (
    <aside className="ledger" aria-label="Totals">
      <div className="ledger-head">
        <span className="ledger-lead">{lead}</span>
        <span className="ledger-scope">{scope}</span>
      </div>
      <p className="ledger-figure">
        <span className="ledger-credits">Cr. {formatCredits(rolled)}</span>
        <span className="ledger-count">{cars === 1 ? '1 car' : `${cars} cars`}</span>
      </p>
      {!garageMode && breakdown.length > 1 && (
        <ul className="ledger-breakdown" aria-label="By where to buy">
          {breakdown.map(([k, b]) => (
            <li key={k} title={`${b.count} car${b.count === 1 ? '' : 's'}${b.unpriced ? `, ${b.unpriced} without a price` : ''}`}>
              <span>{DEALERS[k].short}</span>
              <b>
                {b.credits > 0 ? formatCompact(b.credits) : b.unpriced === b.count ? `${b.count} unpriced` : 'Free'}
              </b>
            </li>
          ))}
        </ul>
      )}
      {!garageMode && (
        <div className="ledger-wallet">
          {canEdit && <WalletField wallet={wallet} onWallet={onWallet} />}
          {walletNote}
        </div>
      )}
    </aside>
  );
}
