import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DEALERS,
  REGISTERS,
  filterEntries,
  formatDay,
  formatFullDate,
  formatLongDay,
  groupEntries,
  joinGarage,
  modelName,
  plural,
  sortEntries,
  summarise,
  todayUtc,
} from '@shared';
import { api, EXPORT_URL } from './api.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Controls from './components/Controls.jsx';
import GroupSection from './components/GroupSection.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import RollCall from './components/RollCall.jsx';
import Ledger from './components/Ledger.jsx';
import { FirstRun, Toast } from './components/Feedback.jsx';
import { EMPTY_FILTERS, countFilters, useRotationCountdown } from './lib/view.js';
import { OwnerContext, setOwnerToken } from './lib/owner.js';

function OwnerBar({ canEdit, authRequired, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  // A server without ADMIN_TOKEN (local use) lets everyone edit: nothing to show.
  if (!authRequired) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (await onSignIn(draft.trim())) {
      setOpen(false);
      setDraft('');
      setError('');
    } else {
      setError('That token was not accepted.');
    }
  };
  if (canEdit) {
    return (
      <p className="owner-bar">
        Signed in as owner. Changes save to the live garage.{' '}
        <button type="button" className="link quiet" onClick={onSignOut}>Sign out</button>
      </p>
    );
  }
  if (open) {
    return (
      <form className="owner-bar" onSubmit={submit}>
        <input type="password" autoFocus placeholder="Owner token" aria-label="Owner token" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="link quiet">Sign in</button>{' '}
        <button type="button" className="link quiet" onClick={() => setOpen(false)}>Cancel</button>
        {error && <span className="owner-error"> {error}</span>}
      </form>
    );
  }
  return (
    <p className="owner-bar">
      A read-only view of Devin's garage.{' '}
      <button type="button" className="link quiet" onClick={() => setOpen(true)}>Owner sign-in</button>
    </p>
  );
}

// ---------------------------------------------------------------------------
// View preferences survive a reload (view, grouping, sort, filters). Wrapped
// in try/catch: storage can be unavailable and the app must not care.
// ---------------------------------------------------------------------------
const PREFS_KEY = 'parc-ferme:view';
const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
};
const savePrefs = (prefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

/** Cars get a flag for whether their maker has an official logo to show. */
function prepareCatalogue(cat) {
  const withLogo = new Set(cat.makers.filter((m) => m.logo).map((m) => m.id));
  return { ...cat, cars: cat.cars.map((c) => ({ ...c, makerLogo: withLogo.has(c.makerId) })) };
}

/** Same rule as the server, applied instantly so the grid never waits. */
function applyLocal(record, patch, now) {
  const base = { owned: false, shortlist: false, notes: '', priceOverride: null, ...record };
  const next = { ...base, ...patch };
  if (patch.owned === true && !base.owned) {
    next.ownedAt = now;
    if (!('shortlist' in patch)) next.shortlist = false;
  }
  if (patch.owned === false) delete next.ownedAt;
  return next;
}

/** Today's stock: Legend Cars first, then Used Cars. Cars you need lead each list. */
function groupDealers(list) {
  return ['legend', 'used']
    .map((dealer) => {
      const entries = list.filter((e) => e.car.stock?.dealer === dealer);
      entries.sort((a, b) => Number(a.owned) - Number(b.owned));
      return { key: dealer, label: DEALERS[dealer].label, entries, stats: summarise(entries) };
    })
    .filter((g) => g.entries.length > 0);
}

/** "Missing: Gr.3, Brand Central, “porsche”" -- what the ledger is totalling. */
function describeScope(register, filters, query) {
  const parts = [];
  if (filters.classes.length) parts.push(filters.classes.join(' or '));
  if (filters.dealers.length) parts.push(filters.dealers.map((d) => DEALERS[d].label).join(' or '));
  if (filters.regions.length) parts.push(filters.regions.join(' or '));
  if (filters.inStock) parts.push('in stock today');
  if (filters.onlyNew) parts.push('new cars');
  if (query.trim()) parts.push(`“${query.trim()}”`);
  const view = REGISTERS[register]?.label;
  return parts.length ? `${view}: ${parts.join(', ')}` : view;
}

export default function App() {
  const prefs = useRef(loadPrefs()).current;
  const [catalogue, setCatalogue] = useState(null);
  const [garage, setGarage] = useState({ wallet: null, cars: {} });
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [firstSyncStep, setFirstSyncStep] = useState(null);

  const [register, setRegister] = useState(prefs.register || null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...(prefs.filters || {}) });
  const [groupBy, setGroupBy] = useState(prefs.groupBy || 'maker');
  const [sort, setSort] = useState(prefs.sort || 'name');

  const [detail, setDetail] = useState(null);
  const [rollCall, setRollCall] = useState(false);
  const [toast, setToast] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [sync, setSync] = useState({ running: false, step: null });
  const [canEdit, setCanEdit] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const a = await api.auth();
      setCanEdit(Boolean(a.canEdit));
      setAuthRequired(Boolean(a.authRequired));
      return Boolean(a.canEdit);
    } catch {
      setCanEdit(false);
      return false;
    }
  }, []);
  useEffect(() => { checkAuth(); }, [checkAuth]);
  const signIn = async (token) => {
    setOwnerToken(token);
    const ok = await checkAuth();
    if (!ok) setOwnerToken('');
    return ok;
  };
  const signOut = () => {
    setOwnerToken('');
    checkAuth();
  };

  const toastTimer = useRef(null);
  const searchRef = useRef(null);
  const importRef = useRef(null);
  const gridRef = useRef(null);
  const navRef = useRef({ detail: null, flat: [] });
  const today = todayUtc();
  const countdown = useRotationCountdown();

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    try {
      const [cat, gar] = await Promise.all([api.catalogue(), api.garage()]);
      setCatalogue(prepareCatalogue(cat));
      setGarage(gar);
      setRegister((r) => r || (Object.values(gar.cars || {}).some((c) => c.owned) ? 'missing' : 'all'));
      setLoadState('ready');
    } catch (error) {
      if (error.status === 503) {
        setLoadState('first-sync');
        setFirstSyncStep(error.body?.step || null);
      } else {
        setLoadState('error');
        setLoadError(
          error.status
            ? `The server answered ${error.status}: ${error.message}`
            : 'The Parc Fermé server is not running. Start it with npm run dev, then reload this page.'
        );
      }
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // While the very first catalogue is being built, follow its progress.
  useEffect(() => {
    if (loadState !== 'first-sync') return undefined;
    const id = setInterval(async () => {
      try {
        const s = await api.syncStatus();
        if (s.generatedAt) loadAll();
        else if (s.lastError && !s.running) setLoadError(`The first sync failed: ${s.lastError.message}`);
        else setFirstSyncStep(s.step);
      } catch {
        // server restarting; keep polling
      }
    }, 1200);
    return () => clearInterval(id);
  }, [loadState, loadAll]);

  const showToast = useCallback((message, undo = null) => {
    setToast({ id: Date.now(), message, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5200 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // The server re-syncs on its own every hour once the dealerships rotate.
  // Pick that up without a reload.
  useEffect(() => {
    if (loadState !== 'ready') return undefined;
    const id = setInterval(async () => {
      try {
        const s = await api.syncStatus();
        if (s.generatedAt && catalogue && s.generatedAt !== catalogue.generatedAt && !s.running) {
          const cat = await api.catalogue();
          setCatalogue(prepareCatalogue(cat));
          showToast(`New dealership stock for ${formatLongDay(cat.dealershipDate)}`);
        }
      } catch {
        // offline for a moment; try again next tick
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [loadState, catalogue, showToast]);

  useEffect(() => {
    if (register) savePrefs({ register, groupBy, sort, filters });
  }, [register, groupBy, sort, filters]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const entries = useMemo(
    () => (catalogue ? joinGarage(catalogue.cars, garage.cars, today) : []),
    [catalogue, garage.cars, today]
  );
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const overall = useMemo(() => summarise(entries), [entries]);
  const counts = useMemo(
    () => ({
      garage: overall.owned,
      missing: overall.missing,
      shortlist: entries.filter((e) => e.shortlist).length,
      dealers: entries.filter((e) => e.car.stock).length,
      all: entries.length,
    }),
    [entries, overall]
  );
  const newCount = useMemo(() => entries.filter((e) => e.isNew).length, [entries]);
  const activeRegister = register || 'all';

  const visible = useMemo(
    () => filterEntries(entries, { register: activeRegister, query, ...filters }),
    [entries, activeRegister, query, filters]
  );
  const groups = useMemo(() => {
    if (activeRegister === 'dealers') {
      return groupDealers(sortEntries(visible, sort === 'name' ? 'leaving-soon' : sort));
    }
    return groupEntries(sortEntries(visible, sort), groupBy, catalogue?.makers || []);
  }, [visible, sort, groupBy, activeRegister, catalogue]);
  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  // Each group measured across owned and missing alike, so a header inside
  // Missing or Garage can still say how complete that maker (or class) is.
  const contextStats = useMemo(() => {
    if (!['missing', 'shortlist', 'garage'].includes(activeRegister) || groupBy === 'none') return null;
    const all = filterEntries(entries, { register: 'all', query, ...filters });
    return new Map(groupEntries(all, groupBy, catalogue?.makers || []).map((g) => [g.key, g.stats]));
  }, [entries, activeRegister, groupBy, query, filters, catalogue]);
  const scopeStats = useMemo(() => summarise(visible), [visible]);
  const makersSorted = useMemo(
    () => (catalogue ? [...catalogue.makers].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [catalogue]
  );

  const detailEntry = detail ? entryById.get(detail.id) : null;
  navRef.current = { detail, flat };
  const detailIndex = detail ? flat.findIndex((e) => e.id === detail.id) : -1;

  // -------------------------------------------------------------------------
  // Writes: optimistic, then confirmed. If the server refuses, the garage is
  // re-read from it rather than guessed back, so what you see is what is saved.
  // -------------------------------------------------------------------------
  const patchCars = useCallback(
    (ids, patch, { message, undo, quiet } = {}) => {
      const now = new Date().toISOString();
      setGarage((g) => {
        const cars = { ...g.cars };
        for (const id of ids) cars[id] = applyLocal(cars[id], patch, now);
        return { ...g, cars };
      });
      const request = ids.length === 1 ? api.patchCar(ids[0], patch) : api.bulk(ids, patch);
      request
        .then(() => {
          setSaveError('');
          if (message && !quiet) showToast(message, undo);
        })
        .catch(async (error) => {
          setSaveError(`That change was not saved (${error.message}). The garage below is what the server has.`);
          try {
            setGarage(await api.garage());
          } catch {
            setSaveError('That change was not saved, and the server cannot be reached. Is it still running?');
          }
        });
    },
    [showToast]
  );

  const onPatch = useCallback(
    (entry, patch, opts = {}) => {
      const name = modelName(entry.car.name);
      let message = opts.message;
      if (!message && 'owned' in patch) message = patch.owned ? `${name} added to your garage` : `${name} removed from your garage`;
      if (!message && 'shortlist' in patch) message = patch.shortlist ? `${name} added to your shortlist` : `${name} taken off your shortlist`;
      const before = { owned: Boolean(entry.record.owned), shortlist: Boolean(entry.record.shortlist) };
      const undo = 'owned' in patch || 'shortlist' in patch ? () => patchCars([entry.id], before, { quiet: true }) : null;
      patchCars([entry.id], patch, { message, undo, quiet: opts.quiet });
    },
    [patchCars]
  );

  const onBulk = useCallback(
    (ids, patch, message) => {
      const wasOwned = ids.filter((id) => garage.cars[id]?.owned);
      const wasNot = ids.filter((id) => !garage.cars[id]?.owned);
      const undo = () => {
        if (wasOwned.length) patchCars(wasOwned, { owned: true }, { quiet: true });
        if (wasNot.length) patchCars(wasNot, { owned: false }, { quiet: true });
      };
      patchCars(ids, patch, { message, undo });
    },
    [garage.cars, patchCars]
  );

  const toggleOwned = useCallback((entry) => onPatch(entry, { owned: !entry.owned }), [onPatch]);
  const toggleShortlist = useCallback((entry) => onPatch(entry, { shortlist: !entry.shortlist }), [onPatch]);

  const setWallet = useCallback((wallet) => {
    setGarage((g) => ({ ...g, wallet }));
    api.setWallet(wallet).catch((error) => setSaveError(`Your credits were not saved (${error.message}).`));
  }, []);

  const runSync = useCallback(
    async (full = false) => {
      setSync({ running: true, step: 'Checking for updates' });
      const poll = setInterval(async () => {
        try {
          const s = await api.syncStatus();
          if (s.step) setSync((x) => ({ ...x, step: s.step.replace(/…$/, '') }));
        } catch {
          // ignore
        }
      }, 700);
      try {
        const result = await api.sync({ full, force: full });
        if (result.changed) {
          setCatalogue(prepareCatalogue(await api.catalogue()));
          showToast(
            result.newCars?.length
              ? `${plural(result.newCars.length, 'new car')} added to the game`
              : `Updated. Dealership stock is for ${formatLongDay(result.dealershipDate)}`
          );
        } else {
          showToast(`Already up to date. Dealership stock is for ${formatLongDay(result.dealershipDate)}`);
        }
      } catch (error) {
        showToast(`Could not check for updates: ${error.message}`);
      } finally {
        clearInterval(poll);
        setSync({ running: false, step: null });
      }
    },
    [showToast]
  );

  const openDetail = useCallback((entry, el) => {
    const r = el.getBoundingClientRect();
    setDetail({ id: entry.id, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, dir: 0 });
  }, []);

  const stepDetail = useCallback((dir) => {
    const { detail: open, flat: list } = navRef.current;
    if (!open) return;
    const idx = list.findIndex((e) => e.id === open.id);
    const next = idx + dir;
    if (idx === -1 || next < 0 || next >= list.length) return;
    setDetail((d) => (d ? { ...d, id: list[next].id, dir } : d));
  }, []);

  const showRegister = useCallback((id) => {
    setRegister(id);
    // Changing view from below the fold brings the grid's top into view.
    const top = gridRef.current?.getBoundingClientRect().top;
    if (typeof top === 'number' && top < 0) gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard: "/" searches, Escape closes, ← → step through the detail view.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape' && detail) {
        e.preventDefault();
        setDetail(null);
        return;
      }
      if (typing || rollCall || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !detail) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (detail && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        stepDetail(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, rollCall, stepDetail]);

  // No page scroll behind an open overlay.
  useEffect(() => {
    document.body.style.overflow = detail || rollCall ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [detail, rollCall]);

  const onImport = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = Object.keys(data.cars || {}).length;
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Replace your garage with this export of ${plural(n, 'car')}? Your current garage is backed up first.`)) return;
      await api.importGarage(data);
      setGarage(await api.garage());
      showToast(`Garage restored with ${plural(n, 'car')}`);
    } catch (error) {
      setSaveError(`That file could not be imported (${error.message}).`);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loadState === 'loading') {
    return (
      <div className="boot" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }
  if (loadState === 'first-sync' || (loadState === 'error' && !catalogue && loadError.startsWith('The first sync'))) {
    return (
      <FirstRun
        step={firstSyncStep}
        error={loadError.startsWith('The first sync') ? loadError : ''}
        onRetry={() => {
          setLoadError('');
          api.sync({ force: true }).catch(() => {});
          setLoadState('first-sync');
        }}
      />
    );
  }
  if (loadState === 'error') {
    return (
      <div className="boot is-error" role="alert">
        <p>{loadError}</p>
        <button type="button" className="btn btn-primary" onClick={() => { setLoadState('loading'); loadAll(); }}>
          Try again
        </button>
      </div>
    );
  }

  const muteMode = activeRegister === 'all' ? 'missing' : activeRegister === 'dealers' ? 'owned' : null;
  const filtered = countFilters(filters) > 0 || query.trim();

  return (
    <OwnerContext.Provider value={canEdit}>
      <Header
        ref={searchRef}
        register={activeRegister}
        counts={counts}
        onRegister={showRegister}
        query={query}
        onQuery={setQuery}
        onRollCall={() => setRollCall(true)}
      />

      <div className="page">
        <Hero
          stats={overall}
          entries={entries}
          onShowStock={() => showRegister('dealers')}
          onRollCall={() => setRollCall(true)}
        />

        <div ref={gridRef} className="grid-anchor" />
        <Controls
          register={activeRegister}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          sort={sort}
          onSort={setSort}
          filters={filters}
          onFilters={setFilters}
          query={query}
          onQuery={setQuery}
          newCount={newCount}
          count={visible.length}
        />

        {saveError && (
          <p className="notice" role="alert">
            {saveError}
          </p>
        )}

        {activeRegister === 'dealers' && (
          <p className="stock-intro">
            Stock for {formatLongDay(catalogue.dealershipDate)}. Both dealerships change at midnight UTC, in {countdown.long}.
            Cars you need come first.{' '}
            {canEdit && (
              <button type="button" className="link" onClick={() => runSync(false)} disabled={sync.running}>
                {sync.running ? 'Checking' : 'Check for new stock'}
              </button>
            )}
          </p>
        )}

        <main className="register">
          {groups.length === 0 || flat.length === 0 ? (
            <div className="empty">
              {filtered ? (
                <>
                  <p className="empty-title">No cars match</p>
                  <p className="empty-body">
                    Search reads the model, maker, class, year, country and dealership. Try fewer words, or clear the filters.
                  </p>
                  <button type="button" className="btn btn-quiet" onClick={() => { setFilters(EMPTY_FILTERS); setQuery(''); }}>
                    Clear search and filters
                  </button>
                </>
              ) : activeRegister === 'garage' ? (
                <>
                  <p className="empty-title">No cars in your garage yet</p>
                  <p className="empty-body">Run a roll call, or press Own it on any car.</p>
                </>
              ) : activeRegister === 'shortlist' ? (
                <>
                  <p className="empty-title">Your shortlist is empty</p>
                  <p className="empty-body">Star the cars you are saving for, and the total at the bottom adds up exactly those.</p>
                </>
              ) : activeRegister === 'missing' ? (
                <>
                  <p className="empty-title">Nothing missing</p>
                  <p className="empty-body">Every car in Gran Turismo 7 is in your garage.</p>
                </>
              ) : (
                <p className="empty-title">Nothing here yet</p>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <GroupSection
                key={`${activeRegister}-${groupBy}-${group.key}`}
                group={group}
                register={activeRegister}
                context={contextStats?.get(group.key)}
                muteMode={muteMode}
                onOpen={openDetail}
                onToggleOwned={toggleOwned}
                onToggleShortlist={toggleShortlist}
              />
            ))
          )}
        </main>

        <footer className="page-foot">
          <div className="foot-actions">
            <a className="link quiet" href={EXPORT_URL} download>
              Export your garage
            </a>
            {canEdit && (
              <>
                <button type="button" className="link quiet" onClick={() => importRef.current?.click()}>
                  Import a garage
                </button>
                <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
                <button type="button" className="link quiet" onClick={() => runSync(false)} disabled={sync.running}>
                  {sync.running ? sync.step || 'Checking' : 'Check for updates'}
                </button>
                <button type="button" className="link quiet" onClick={() => runSync(true)} disabled={sync.running}>
                  Re-read every source
                </button>
              </>
            )}
          </div>
          <OwnerBar canEdit={canEdit} authRequired={authRequired} onSignIn={signIn} onSignOut={signOut} />
          <p>
            The car list, prices and daily dealership history come from{' '}
            <a href="https://github.com/ddm999/gt7info" target="_blank" rel="noreferrer">gt7info</a> (MIT-0). Specs and
            photographs come from the{' '}
            <a href="https://www.gran-turismo.com/us/gt7/carlist/" target="_blank" rel="noreferrer">official GT7 car list</a>,
            and current Brand Central prices from the{' '}
            <a href="https://gran-turismo.fandom.com/" target="_blank" rel="noreferrer">Gran Turismo Wiki</a> (CC BY-SA). This
            catalogue was built on {formatFullDate(catalogue.generatedAt)}, with dealership stock for{' '}
            {formatDay(catalogue.dealershipDate)}.
          </p>
          <p>A fan-made tracker, not affiliated with Polyphony Digital or Sony Interactive Entertainment.</p>
        </footer>
      </div>

      <Ledger
        register={activeRegister}
        scope={describeScope(activeRegister, filters, query)}
        stats={scopeStats}
        wallet={garage.wallet}
        onWallet={setWallet}
      />

      {detail && detailEntry && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          onClick={() => setDetail(null)}
        >
          <DetailPanel
            detail={{ ...detail, entry: detailEntry }}
            position={{ index: detailIndex, total: flat.length }}
            hasPrev={detailIndex > 0}
            hasNext={detailIndex >= 0 && detailIndex < flat.length - 1}
            onStep={stepDetail}
            onClose={() => setDetail(null)}
            onPatch={onPatch}
            today={today}
          />
        </motion.div>
      )}

      {rollCall && (
        <div className="overlay rc-overlay">
          <RollCall
            entries={entries}
            makers={makersSorted}
            onPatch={onPatch}
            onBulk={onBulk}
            onClose={() => setRollCall(false)}
          />
        </div>
      )}

      <Toast
        toast={toast}
        onUndo={() => {
          toast?.undo?.();
          setToast(null);
        }}
      />
    </OwnerContext.Provider>
  );
}
