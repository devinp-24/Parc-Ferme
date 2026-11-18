import { useCanEdit } from '../lib/owner.js';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, ExternalLink, Gift, Plus, Star, X } from 'lucide-react';
import {
  DEALERS,
  formatCompact,
  formatCredits,
  formatDay,
  hpToKw,
  lbsToKg,
  modelName,
  priceNote,
  relativeDay,
  stockLabel,
} from '@shared';
import { api, logoUrl, photoUrl } from '../api.js';
import { Silhouette } from './CarPhoto.jsx';
import { useLoadedSrc } from '../lib/useLoadedSrc.js';
import HistoryChart from './HistoryChart.jsx';

const SHOT_ORDER = ['1_01', '2_01', '2_02', '3_01', '1_02', '1_03', '3_02'];
const shotLabel = (s) =>
  s.startsWith('1_') ? (s === '1_01' ? 'Location' : `Location ${Number(s.slice(2))}`)
    : s === '2_01' ? 'Studio, front'
      : s === '2_02' ? 'Studio, rear'
        : 'Interior';

const rpm = (text) => (text && text.includes('/') ? text.split('/')[1].trim() : null);
const inchesToMm = (n) => (typeof n === 'number' ? Math.round(n * 25.4) : null);

function Hero({ car, shot }) {
  const has = Boolean(car.shots?.length);
  const src = has ? photoUrl(car.id, shot, 1600) : null;
  const img = useLoadedSrc(src);
  if (!has) return <Silhouette car={car} />;
  return (
    <div className="hero-stack">
      {/* The grid's studio shot is already in the browser cache, so it paints
          instantly while the large photo loads over it. */}
      <img className="hero-base" src={photoUrl(car.id, '2_01', 800)} alt="" aria-hidden="true" />
      <img
        key={src}
        ref={img.ref}
        className={`hero-main ${img.ready ? 'is-loaded' : ''}`}
        src={src}
        alt={`${car.fullName}, ${shotLabel(shot).toLowerCase()}`}
        onLoad={img.onLoad}
      />
    </div>
  );
}

function Acquire({ entry, history, today }) {
  const { car, owned, record } = entry;
  const stock = car.stock ? stockLabel(car.stock) : null;
  const dealer = DEALERS[car.dealer];
  let status;
  if (car.stock && car.stock.state !== 'soldout') {
    status = (
      <p className={`acq-status is-live tone-${stock.tone}`}>
        {stock.long}
        {stock.isNew ? ', just arrived' : ''}
        {stock.limited ? ' (limited stock)' : ''}
      </p>
    );
  } else if (car.stock?.state === 'soldout') {
    status = <p className="acq-status">Listed in {DEALERS[car.stock.dealer].label} today, but sold out</p>;
  } else if (car.dealer === 'brand') {
    status = <p className="acq-status">Always for sale at Brand Central</p>;
  } else if (car.dealer === 'used' || car.dealer === 'legend') {
    status = (
      <p className="acq-status">
        Not in {dealer.label} today
        {car.seen ? `. Last seen ${formatDay(car.seen.lastSeen)}, ${relativeDay(car.seen.lastSeen, today)}.` : '.'}
      </p>
    );
  } else if (car.dealer === 'dlc') {
    status = <p className="acq-status">Unlocked through the Power Pack DLC</p>;
  } else if (car.dealer === 'reward') {
    status = <p className="acq-status">Reward only: never sold in a dealership</p>;
  } else {
    status = <p className="acq-status">Not currently obtainable</p>;
  }

  const ways = [
    ...(car.rewards || []).map((r) => r.label),
    car.lottery ? `Roulette: ${car.lottery.label}` : null,
    car.otherMethods,
  ].filter(Boolean);

  return (
    <section className="detail-section acquire" aria-label="How to get it">
      <h3 className="section-title">{owned ? 'In your garage' : 'How to get it'}</h3>
      {owned && (
        <p className="acq-status is-owned">
          <Check size={14} aria-hidden="true" /> Owned{record.ownedAt ? ` since ${formatDay(record.ownedAt)}` : ''}
        </p>
      )}
      {status}
      <p className="acq-price">
        {entry.price === null ? (
          <span className="acq-none">No price</span>
        ) : entry.price === 0 ? (
          'Free'
        ) : (
          <>
            <small>Cr.</small>
            {formatCredits(entry.price)}
          </>
        )}
      </p>
      <p className="acq-note">{priceNote(entry, today)}</p>

      {car.seen && (
        <>
          {history === null ? (
            <p className="history-loading">Reading dealership history…</p>
          ) : (
            <HistoryChart stints={history} today={today} />
          )}
          <p className="acq-seen">
            {car.seen.visits === 1 ? 'Seen once' : `Seen ${car.seen.visits} times`} in {DEALERS[car.seen.dealer].label} since{' '}
            {formatDay(car.seen.firstSeen)}, usually for about {car.seen.avgStay} days
            {car.seen.minCr !== car.seen.maxCr
              ? `, at between Cr. ${formatCompact(car.seen.minCr)} and Cr. ${formatCompact(car.seen.maxCr)}.`
              : '.'}
            {car.dealer === 'brand' && car.seen.dealer === 'used' && car.seen.minCr < (car.bcPrice ?? Infinity)
              ? ` Used, it has gone for as little as Cr. ${formatCompact(car.seen.minCr)}.`
              : ''}
          </p>
        </>
      )}

      {ways.length > 0 && (
        <div className="acq-ways">
          <h4>
            <Gift size={13} aria-hidden="true" /> {car.dealer === 'reward' ? 'Ways to get it' : 'Also obtainable'}
          </h4>
          <ul>
            {ways.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {car.addedInUpdate && <p className="acq-meta">Added to GT7 in update {car.addedInUpdate}</p>}
    </section>
  );
}

function Spec({ car }) {
  const kg = lbsToKg(car.weightLbs);
  const hpPerTonne = car.powerHp && kg ? Math.round(car.powerHp / (kg / 1000)) : null;
  const dims = [car.lengthIn, car.widthIn, car.heightIn].map(inchesToMm);
  const tiles = [
    ['Power', car.powerHp ? `${car.powerHp}` : null, 'HP', [hpToKw(car.powerHp) && `${hpToKw(car.powerHp)} kW`, rpm(car.maxPower)].filter(Boolean).join(' at ')],
    ['Torque', car.torqueFtLb ? `${car.torqueFtLb}` : null, 'ft-lb', rpm(car.maxTorque) ? `at ${rpm(car.maxTorque)}` : null],
    ['Weight', kg ? formatCredits(kg) : null, 'kg', car.weightLbs ? `${formatCredits(car.weightLbs)} lbs` : null],
    ['Performance', car.pp ? car.pp.toFixed(2) : null, 'PP', null],
    ['Power / weight', hpPerTonne ? `${hpPerTonne}` : null, 'HP/t', null],
    ['Drivetrain', car.drivetrain, null, null],
    ['Aspiration', car.aspiration, null, car.aspirationLong?.replace(/^\w+\s*\(|\)$/g, '') || null],
    ['Displacement', car.displacementCc ? formatCredits(car.displacementCc) : null, 'cc', null],
  ].filter(([, v]) => v);

  return (
    <section className="detail-section spec" aria-label="Specification">
      <h3 className="section-title">Specification</h3>
      {tiles.length === 0 ? (
        <p className="acq-note">Specs arrive with the next official car list update.</p>
      ) : (
        <dl className="telemetry">
          {tiles.map(([label, value, unit, sub]) => (
            <div className="tele" key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="tele-value">{value}</span>
                {unit && <span className="tele-unit">{unit}</span>}
              </dd>
              {sub && <dd className="tele-sub">{sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      {dims.every(Boolean) && (
        <p className="dims">
          {formatCredits(dims[0])} mm long, {formatCredits(dims[1])} mm wide, {formatCredits(dims[2])} mm tall
        </p>
      )}
    </section>
  );
}

function Personal({ entry, onPatch }) {
  const { record, car } = entry;
  const [notes, setNotes] = useState(record.notes || '');
  const [price, setPrice] = useState(typeof record.priceOverride === 'number' ? formatCredits(record.priceOverride) : '');
  useEffect(() => {
    setNotes(record.notes || '');
    setPrice(typeof record.priceOverride === 'number' ? formatCredits(record.priceOverride) : '');
  }, [car.id, record.notes, record.priceOverride]);

  const saveNotes = () => {
    if ((record.notes || '') !== notes) onPatch(entry, { notes }, { quiet: true });
  };
  const savePrice = () => {
    const digits = price.replace(/[^\d]/g, '');
    const next = digits ? Number(digits) : null;
    const current = typeof record.priceOverride === 'number' ? record.priceOverride : null;
    if (next !== current) onPatch(entry, { priceOverride: next }, { message: next === null ? 'Price override removed' : 'Price saved' });
  };

  return (
    <section className="detail-section personal" aria-label="Your notes">
      <h3 className="section-title">Your notes</h3>
      <label className="field">
        <span>Notes</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Tuning plans, which livery, why you want it…"
        />
      </label>
      <label className="field inline">
        <span>Price override</span>
        <input
          value={price}
          inputMode="numeric"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={car.price !== null ? `Catalogue says ${formatCredits(car.price)}` : 'Set a price in credits'}
        />
      </label>
    </section>
  );
}

export default function DetailPanel({ detail, position, hasPrev, hasNext, onStep, onClose, onPatch, today }) {
  const canEdit = useCanEdit();
  const { entry, rect, dir = 0 } = detail;
  const { car, owned, shortlist } = entry;
  const shots = useMemo(
    () => [...(car.shots || [])].sort((a, b) => SHOT_ORDER.indexOf(a) - SHOT_ORDER.indexOf(b)),
    [car.shots]
  );
  const [shot, setShot] = useState(shots[0] || '2_01');
  const [history, setHistory] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setShot(shots[0] || '2_01');
    setConfirmRemove(false);
  }, [car.id, shots]);

  useEffect(() => {
    // Blank first, or the previous car's history shows while this one loads.
    setHistory(null);
    if (!car.seen) return undefined;
    let live = true;
    api
      .history(car.id)
      .then((h) => live && setHistory(h.stints || []))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [car.id, car.seen]);

  // O toggles owned, S toggles shortlist -- not while typing.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !canEdit) return;
      if (e.key === 'o') {
        e.preventDefault();
        onPatch(entry, { owned: !owned });
      } else if (e.key === 's' && !owned) {
        e.preventDefault();
        onPatch(entry, { shortlist: !shortlist });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, owned, shortlist, onPatch, canEdit]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const compact = vw < 760;
  const width = compact ? vw : Math.min(1120, vw - 48);
  const height = compact ? vh : Math.min(900, vh - 40);
  const target = {
    top: compact ? 0 : Math.max(20, (vh - height) / 2),
    left: compact ? 0 : Math.max(24, (vw - width) / 2),
    width,
    height,
  };

  const makerLogo = car.makerLogo;

  return (
    <motion.div
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label={car.fullName}
      onClick={(e) => e.stopPropagation()}
      initial={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: 10 }}
      animate={{ ...target, borderRadius: compact ? 0 : 18 }}
      transition={{ type: 'spring', stiffness: 240, damping: 30 }}
    >
      <motion.div
        className="detail-inner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }}
      >
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="detail-scroll">
          <div className="detail-hero">
            <motion.div
              className="hero-frame"
              key={`hero-${car.id}`}
              initial={{ opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <Hero car={car} shot={shot} />
            </motion.div>
            <div className="hero-fade" aria-hidden="true" />
            <button type="button" className="hero-nav prev" onClick={() => onStep(-1)} disabled={!hasPrev}
              aria-label="Previous car" title="Previous car (←)">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="hero-nav next" onClick={() => onStep(1)} disabled={!hasNext}
              aria-label="Next car" title="Next car (→)">
              <ChevronRight size={20} />
            </button>
            {shots.length > 1 && (
              <div className="hero-shots" role="tablist" aria-label="Photos">
                {shots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={s === shot}
                    className={`hero-shot ${s === shot ? 'is-on' : ''}`}
                    onClick={() => setShot(s)}
                    title={shotLabel(s)}
                  >
                    <img src={photoUrl(car.id, s, 320)} alt={shotLabel(s)} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {position.total > 1 && position.index >= 0 && (
              <p className="hero-counter">
                {position.index + 1} / {position.total}
              </p>
            )}
          </div>

          <motion.div
            className="detail-body"
            key={`body-${car.id}`}
            initial={{ opacity: 0, x: dir * 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className="detail-title">
              <p className="detail-kicker">
                {makerLogo && <img src={logoUrl(car.makerId)} alt="" className="kicker-logo" />}
                <span>{car.maker}</span>
                {car.year && <span>{car.year}</span>}
                <span>{car.countryName}</span>
              </p>
              <h2 className="detail-name">{modelName(car.name)}</h2>
              <p className="detail-chips">
                {car.carClass && <span className="chip-static">{car.carClass}</span>}
                {car.drivetrain && <span className="chip-static">{car.drivetrain}</span>}
                {car.aspiration && <span className="chip-static">{car.aspiration}</span>}
                {car.pp && <span className="chip-static">{car.pp.toFixed(2)} PP</span>}
                {entry.isNew && <span className="chip-static is-new">New</span>}
              </p>
            </div>

            <div className="detail-columns">
              <Acquire entry={entry} history={history} today={today} />
              <Spec car={car} />
            </div>
            {canEdit && <Personal entry={entry} onPatch={onPatch} />}
          </motion.div>
        </div>

        <footer className="detail-actions">
          <div className="detail-actions-left">
            {!owned && canEdit && (
              <button
                type="button"
                className={`ghost-btn ${shortlist ? 'is-on' : ''}`}
                onClick={() => onPatch(entry, { shortlist: !shortlist })}
                aria-pressed={shortlist}
                title="Shortlist (S)"
              >
                <Star size={15} /> {shortlist ? 'Shortlisted' : 'Shortlist'}
              </button>
            )}
            {car.wikiTitle && (
              <a
                className="ghost-btn"
                href={`https://gran-turismo.fandom.com/wiki/${encodeURIComponent(car.wikiTitle.replace(/ /g, '_'))}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={14} /> GT Wiki
              </a>
            )}
          </div>
          {!canEdit ? (
            <span className="detail-status">{owned ? 'In the garage' : 'Not in the garage yet'}</span>
          ) : owned ? (
            confirmRemove ? (
              <div className="confirm">
                <span>Remove from your garage?</span>
                <button type="button" className="ghost-btn" onClick={() => setConfirmRemove(false)}>
                  Keep
                </button>
                <button type="button" className="danger-btn" onClick={() => onPatch(entry, { owned: false })}>
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" className="owned-btn" onClick={() => setConfirmRemove(true)} title="Toggle owned (O)">
                <Check size={16} /> In your garage
              </button>
            )
          ) : (
            <button type="button" className="primary-btn" onClick={() => onPatch(entry, { owned: true })} title="Mark as owned (O)">
              <Plus size={16} /> Add to garage
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  );
}
