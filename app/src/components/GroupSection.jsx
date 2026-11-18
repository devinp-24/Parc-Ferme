import { memo } from 'react';
import { formatCompact } from '@shared';
import { logoUrl } from '../api.js';
import Plate from './Plate.jsx';

// A group's completion as ten segments, read like the rev counter: white as
// they fill, and the last tenth in redline red -- the same stretch the dial
// paints red. A complete group is a full white bar.
export function Progress({ owned, total }) {
  const lit = total > 0 ? Math.round((owned / total) * 10) : 0;
  const complete = total > 0 && owned === total;
  return (
    <span className={`progress ${complete ? 'is-complete' : ''}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`seg ${i < lit ? 'on' : ''} ${i === 9 ? 'last' : ''}`} />
      ))}
    </span>
  );
}

// `context` is the same group measured across owned AND missing cars (same
// search and filters, any register): inside Missing every car on screen is
// unowned, so the group's own numbers could never fill a segment.
function GroupHeader({ group, register, context }) {
  const { stats } = group;
  const overall = context || stats;
  const complete = overall.total > 0 && overall.owned === overall.total;

  let count;
  if (register === 'garage') count = `${stats.owned} of ${overall.total}`;
  else if (register === 'dealers') count = stats.missing === 0 ? 'You have them all' : `${stats.missing} you need`;
  else if (register === 'missing' || register === 'shortlist') count = `${overall.owned} of ${overall.total}`;
  else count = `${stats.owned} of ${stats.total}`;

  let money = null;
  if (register !== 'garage' && stats.missing > 0) {
    if (stats.credits === 0) money = stats.unpriced === stats.missing ? 'Not for sale' : 'Free to finish';
    else money = `Cr. ${formatCompact(stats.credits)} ${register === 'dealers' ? 'for those' : 'to finish'}`;
  }

  return (
    <header className="group-head">
      <div className="group-title">
        {group.logoMakerId && <img className="group-logo" src={logoUrl(group.logoMakerId)} alt="" loading="lazy" />}
        <h2>{group.label}</h2>
        {group.sub && <span className="group-sub">{group.sub}</span>}
      </div>
      <div className="group-stats">
        {register !== 'dealers' && <Progress owned={overall.owned} total={overall.total} />}
        <span className="group-count">{count}</span>
        {complete && register !== 'dealers' ? (
          <span className="group-money is-complete">Complete</span>
        ) : (
          money && <span className="group-money">{money}</span>
        )}
      </div>
    </header>
  );
}

function GroupSection({ group, register, context, muteMode, onOpen, onToggleOwned, onToggleShortlist }) {
  return (
    <section className="group" aria-label={group.label || 'Cars'}>
      {group.label && <GroupHeader group={group} register={register} context={context} />}
      <div className="plate-grid">
        {group.entries.map((entry) => (
          <Plate
            key={entry.id}
            entry={entry}
            register={register}
            muteMode={muteMode}
            onOpen={onOpen}
            onToggleOwned={onToggleOwned}
            onToggleShortlist={onToggleShortlist}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(GroupSection);
