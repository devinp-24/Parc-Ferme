import { useCanEdit } from '../lib/owner.js';
import { memo } from 'react';
import { Check, Plus, Star } from 'lucide-react';
import { formatCredits, modelName, priceNote, stockLabel } from '@shared';
import CarPhoto from './CarPhoto.jsx';

// A plate: the car, its name, what it costs and where that number came from.
//
// Status is carried by the photograph. In the mixed views a car you do not own
// is shown the way GT7's own Collection shows it, in grey, and hovering lifts
// the colour: a preview of the unlock. The only label on a photograph is time:
// a car in a dealership today says how long it has left.
//
// `muteMode` says which cars recede: in All cars it is the ones you do not own;
// in today's stock it flips, because there the missing cars are the point.

function Plate({ entry, register, muteMode, onOpen, onToggleOwned, onToggleShortlist }) {
  const canEdit = useCanEdit();
  const { car, owned, shortlist, price, isNew } = entry;
  const stock = car.stock ? stockLabel(car.stock) : null;
  const muted = muteMode === 'missing' ? !owned : muteMode === 'owned' ? owned : false;

  return (
    <article className={`plate ${owned ? 'is-owned' : 'is-missing'} ${muted ? 'is-muted' : ''}`}>
      <button type="button" className="plate-photo" onClick={(e) => onOpen(entry, e.currentTarget)} aria-label={`Open ${car.fullName}`}>
        <CarPhoto car={car} alt="" />
        {(stock || isNew) && (
          <span className="plate-flags">
            {isNew && <span className="flag flag-new">New</span>}
            {stock && (
              <span className={`flag tone-${stock.tone}`}>{register === 'dealers' ? stock.text : stock.long}</span>
            )}
          </span>
        )}
      </button>

      {canEdit && <div className="plate-quick">
        {!owned && (
          <button
            type="button"
            className={`quick star ${shortlist ? 'is-on' : ''}`}
            onClick={() => onToggleShortlist(entry)}
            aria-pressed={shortlist}
            aria-label={shortlist ? `Remove ${car.fullName} from your shortlist` : `Shortlist ${car.fullName}`}
            title={shortlist ? 'On your shortlist' : 'Add to your shortlist'}
          >
            <Star size={14} />
          </button>
        )}
        <button
          type="button"
          className={`quick own ${owned ? 'is-on' : ''}`}
          onClick={() => onToggleOwned(entry)}
          aria-pressed={owned}
          aria-label={owned ? `Remove ${car.fullName} from your garage` : `Add ${car.fullName} to your garage`}
          title={owned ? 'In your garage. Click to remove' : 'Add to your garage'}
        >
          {owned ? <Check size={14} /> : <Plus size={14} />}
          <span>{owned ? 'Owned' : 'Own it'}</span>
        </button>
      </div>}

      <div className="plate-caption">
        <p className="plate-meta">
          <span className="plate-maker">
            {owned && <Check size={12} className="owned-tick" aria-label="Owned" />}
            {car.maker}
          </span>
          {car.year && <span className="plate-year">{car.year}</span>}
        </p>
        <h3 className="plate-name">{modelName(car.name)}</h3>
        <p className="plate-figures">
          <span className={`plate-price ${price === null ? 'is-none' : ''}`}>
            {price === null ? 'No price' : price === 0 ? 'Free' : `Cr. ${formatCredits(price)}`}
          </span>
          <span className="plate-spec">
            {car.carClass}
            {car.pp ? <span>{Math.round(car.pp)} PP</span> : null}
          </span>
        </p>
        <p className={`plate-note ${car.priceKind === 'live' && !entry.overridden ? 'is-live' : ''}`}>{priceNote(entry)}</p>
      </div>
    </article>
  );
}

export default memo(Plate);
