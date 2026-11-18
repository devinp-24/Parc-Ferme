import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import { filterEntries, formatCompact, modelName, sortEntries } from '@shared';
import { logoUrl, photoUrl } from '../api.js';

// Roll call: the fast way to tell the tracker what you already own.
//
// GT7 cannot export your garage, so the first job is ticking ~hundreds of cars
// by hand. That is only bearable if it moves at the speed of the game's own
// Collection screen: makers down the left, that maker's cars on the right,
// one keypress per car. Every tick saves immediately.
//
//   ↑ ↓      move between cars          Space / Enter   tick or untick
//   ← →      previous / next maker      /               search everything

export default function RollCall({ entries, makers, onPatch, onBulk, onClose }) {
  const [makerId, setMakerId] = useState(() => makers[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  // Whether keyboard focus belongs in the list. Focus follows the cursor only
  // then -- otherwise typing in the search box would have every keystroke's
  // re-render yank focus down onto the first result.
  const listFocus = useRef(true);

  const byMaker = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.car.makerId)) map.set(e.car.makerId, []);
      map.get(e.car.makerId).push(e);
    }
    return map;
  }, [entries]);

  const rows = useMemo(() => {
    if (query.trim()) return sortEntries(filterEntries(entries, { query }), 'name').slice(0, 80);
    return sortEntries(byMaker.get(makerId) || [], 'year-asc');
  }, [entries, byMaker, makerId, query]);

  const owned = entries.filter((e) => e.owned).length;
  const makerIndex = makers.findIndex((m) => m.id === makerId);
  const currentMaker = makers[makerIndex];
  const makerRows = byMaker.get(makerId) || [];
  const makerOwned = makerRows.filter((e) => e.owned).length;

  useEffect(() => setCursor(0), [makerId, query]);

  useEffect(() => {
    if (!listFocus.current) return;
    listRef.current?.querySelector(`[data-row="${cursor}"]`)?.focus();
  }, [cursor, makerId, rows.length]);

  const stepMaker = (dir) => {
    const next = makers[Math.min(makers.length - 1, Math.max(0, makerIndex + dir))];
    if (next) {
      setQuery('');
      setMakerId(next.id);
    }
  };

  const onListKey = (e) => {
    listFocus.current = true;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'ArrowRight' && !query) {
      e.preventDefault();
      stepMaker(1);
    } else if (e.key === 'ArrowLeft' && !query) {
      e.preventDefault();
      stepMaker(-1);
    } else if (e.key === '/') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) setQuery('');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, onClose]);

  return (
    <motion.div
      className="rollcall"
      role="dialog"
      aria-modal="true"
      aria-label="Roll call"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      <header className="rc-head">
        <div>
          <h2>Roll call</h2>
          <p className="rc-hint">
            Tick every car you own, maker by maker, alongside GT7’s Collection screen. Use <kbd>↑</kbd> <kbd>↓</kbd> to
            move, <kbd>Space</kbd> to tick, <kbd>←</kbd> <kbd>→</kbd> to change maker and <kbd>/</kbd> to search.
          </p>
        </div>
        <div className="rc-progress">
          <span className="rc-count">
            {owned} of {entries.length}
          </span>
          <span className="rc-bar" aria-hidden="true">
            <span style={{ width: `${(owned / Math.max(1, entries.length)) * 100}%` }} />
          </span>
        </div>
        <button type="button" className="rc-close" onClick={onClose} aria-label="Close roll call">
          <X size={18} />
        </button>
      </header>

      <div className="rc-body">
        <nav className="rc-makers" aria-label="Manufacturers">
          {makers.map((m) => {
            const list = byMaker.get(m.id) || [];
            const got = list.filter((e) => e.owned).length;
            const done = got === list.length && list.length > 0;
            return (
              <button
                key={m.id}
                type="button"
                className={`rc-maker ${m.id === makerId && !query ? 'is-on' : ''} ${done ? 'is-done' : ''}`}
                onClick={() => {
                  setQuery('');
                  setMakerId(m.id);
                }}
              >
                <span className="rc-maker-name">{m.name}</span>
                <span className="rc-maker-count">
                  {done ? <Check size={12} aria-label="complete" /> : `${got}/${list.length}`}
                </span>
                <span className="rc-maker-bar" aria-hidden="true">
                  <span style={{ width: `${(got / Math.max(1, list.length)) * 100}%` }} />
                </span>
              </button>
            );
          })}
        </nav>

        <section className="rc-pane" aria-label={query ? 'Search results' : currentMaker?.name}>
          <div className="rc-pane-head">
            {query ? (
              <h3>
                {rows.length} match{rows.length === 1 ? '' : 'es'} for “{query.trim()}”
              </h3>
            ) : (
              <h3 className="rc-maker-title">
                {currentMaker?.logo && <img src={logoUrl(currentMaker.id)} alt="" />}
                <span>{currentMaker?.name}</span>
                <small>
                  {makerOwned} of {makerRows.length}
                </small>
              </h3>
            )}
            <label className="search rc-search">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">Search all cars</span>
              <input
                ref={searchRef}
                value={query}
                onFocus={() => {
                  listFocus.current = false;
                }}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    listFocus.current = true;
                    listRef.current?.querySelector('[data-row="0"]')?.focus();
                    setCursor(0);
                  }
                }}
                placeholder="Search every car…"
                autoComplete="off"
              />
            </label>
            {!query && makerRows.length > 0 && (
              <div className="rc-bulk">
                <button
                  type="button"
                  className="text-btn"
                  disabled={makerOwned === makerRows.length}
                  onClick={() => onBulk(makerRows.map((e) => e.id), { owned: true }, `All ${currentMaker?.name} marked owned`)}
                >
                  Tick all
                </button>
                <button
                  type="button"
                  className="text-btn"
                  disabled={makerOwned === 0}
                  onClick={() => onBulk(makerRows.map((e) => e.id), { owned: false }, `${currentMaker?.name} cleared`)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <ul className="rc-list" ref={listRef} onKeyDown={onListKey} role="listbox" aria-multiselectable="true">
            {rows.map((e, i) => (
              <li key={e.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={e.owned}
                  data-row={i}
                  tabIndex={i === cursor ? 0 : -1}
                  className={`rc-row ${e.owned ? 'is-owned' : ''}`}
                  onFocus={() => setCursor(i)}
                  onClick={() => onPatch(e, { owned: !e.owned }, { quiet: true })}
                >
                  <span className="rc-check" aria-hidden="true">
                    {e.owned && <Check size={14} />}
                  </span>
                  <span className="rc-thumb">
                    {e.car.shots?.includes('2_01') ? (
                      <img src={photoUrl(e.id, '2_01', 320)} alt="" loading="lazy" />
                    ) : null}
                  </span>
                  <span className="rc-name">
                    {query && <small>{e.car.maker}</small>}
                    {modelName(e.car.name)}
                  </span>
                  <span className="rc-year">{e.car.year || '—'}</span>
                  <span className="rc-class">{e.car.carClass || ''}</span>
                  <span className="rc-price">{e.price === null ? '—' : e.price === 0 ? 'Free' : formatCompact(e.price)}</span>
                </button>
              </li>
            ))}
          </ul>

          {!query && makerIndex < makers.length - 1 && (
            <footer className="rc-foot">
              <button type="button" className="tool-btn" onClick={() => stepMaker(1)}>
                Next: {makers[makerIndex + 1]?.name} <ChevronRight size={14} />
              </button>
            </footer>
          )}
        </section>
      </div>
    </motion.div>
  );
}
