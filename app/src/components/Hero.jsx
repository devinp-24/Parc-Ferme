import { useCanEdit } from '../lib/owner.js';
import { formatCredits, modelName } from '@shared';
import Instrument from './Instrument.jsx';

// The first screen says where you stand in plain sentences, beside the one
// instrument. The numbers live in the sentences, not in a strip of figures:
// what you own, what the rest costs, and whether anything you need is in a
// dealership today -- which, given the rotation, is the most time-sensitive
// thing on the page.

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const spell = (n) => SMALL[n] ?? String(n);
const nameOf = (car) => modelName(car.fullName);

function TodayLine({ entries, onShowStock }) {
  const today = entries.filter((e) => !e.owned && e.car.stock && e.car.stock.state !== 'soldout');
  if (today.length === 0) return <p className="hero-sub">Nothing you need is in a dealership today.</p>;
  const tonight = today.filter((e) => typeof e.car.stock.daysLeft === 'number' && e.car.stock.daysLeft <= 1);
  const verb = today.length === 1 ? 'is' : 'are';
  let tail = '.';
  if (tonight.length === 1) tail = `; the ${nameOf(tonight[0].car)} leaves tonight.`;
  else if (tonight.length > 1) tail = `; the ${nameOf(tonight[0].car)} and ${spell(tonight.length - 1)} more leave tonight.`;
  return (
    <p className="hero-sub">
      <button type="button" className="link" onClick={onShowStock}>
        {today.length} of them {verb} in a dealership today
      </button>
      {tail}
    </p>
  );
}

export default function Hero({ stats, entries, onShowStock, onRollCall }) {
  const canEdit = useCanEdit();
  const { owned, total, missing, credits, unpriced } = stats;

  let copy;
  if (owned === 0) {
    copy = (
      <>
        <p className="hero-line">Your garage is empty.</p>
        <p className="hero-line is-dim">
          All {total} cars in Gran Turismo 7 cost {formatCredits(credits)} credits together.
        </p>
        <p className="hero-sub">
          GT7 can’t export your garage, so tick off the cars you own with a roll call. Each tick saves straight away.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={onRollCall}>
            Start the roll call
          </button>
        )}
      </>
    );
  } else if (missing === 0) {
    copy = (
      <>
        <p className="hero-line">Every car in Gran Turismo 7 is in your garage.</p>
        <p className="hero-line is-dim">All {total} of them.</p>
      </>
    );
  } else {
    copy = (
      <>
        <p className="hero-line">
          {canEdit ? 'You own' : 'Devin owns'} {owned} of the {total} cars in Gran Turismo 7.
        </p>
        <p className="hero-line is-dim">
          The rest cost {formatCredits(credits)} credits
          {unpriced > 0 ? `, apart from ${spell(unpriced)} you can’t buy.` : '.'}
        </p>
        <TodayLine entries={entries} onShowStock={onShowStock} />
      </>
    );
  }

  return (
    <section className="hero" aria-label="Your collection">
      <div className="hero-copy">{copy}</div>
      <Instrument value={owned} total={total} />
    </section>
  );
}
