import { photoUrl, logoUrl } from '../api.js';
import { useLoadedSrc } from '../lib/useLoadedSrc.js';

// A car on the showroom floor. Polyphony's studio shots fade to #090909 at the
// edges, which is the page colour, so the photo needs no frame at all: a soft
// mask feathers the last few percent and the car simply sits on the page.
//
// Cars the official list has not photographed yet (usually the newest DLC
// cars, for a few weeks after an update) get a drawn silhouette and the maker's
// logo instead of a broken image.

export function Silhouette({ car }) {
  return (
    <div className="silhouette">
      <svg viewBox="0 0 320 120" aria-hidden="true">
        <path
          d="M18 92c0-9 4-14 14-16l46-7c18-14 40-27 70-30 26-2 52 2 74 15 13 7 25 15 36 23 16 2 32 5 34 15 2 6 0 10-4 12H18z"
          className="silhouette-body"
        />
        <circle cx="78" cy="94" r="17" className="silhouette-wheel" />
        <circle cx="246" cy="94" r="17" className="silhouette-wheel" />
        <path d="M104 66c14-12 32-20 52-21 18-1 34 3 50 10l18 11z" className="silhouette-glass" />
      </svg>
      {car.makerLogo ? (
        <img className="silhouette-logo" src={logoUrl(car.makerId)} alt="" loading="lazy" />
      ) : (
        <span className="silhouette-maker">{car.maker}</span>
      )}
      <span className="silhouette-note">Photo arrives with the next official list update</span>
    </div>
  );
}

export default function CarPhoto({ car, shot = '2_01', width = 800, className = '', eager = false, alt }) {
  const available = Array.isArray(car.shots) && car.shots.includes(shot);
  const src = available ? photoUrl(car.id, shot, width) : null;
  const img = useLoadedSrc(src);
  const state = !src ? 'missing' : img.failed ? 'error' : img.ready ? 'ready' : 'loading';

  return (
    <div className={`car-photo ${className} is-${state}`}>
      {src && !img.failed && (
        <img
          ref={img.ref}
          src={src}
          alt={alt ?? car.fullName}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={img.onLoad}
          onError={img.onError}
        />
      )}
      {(state === 'missing' || state === 'error') && <Silhouette car={car} />}
    </div>
  );
}
