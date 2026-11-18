import { useCanEdit } from '../lib/owner.js';
import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { REGISTERS } from '@shared';

// One quiet bar: the name, the five views with their counts, search, and the
// roll call. Everything that used to crowd the top of the page either lives
// here or moved down to the grid it controls.

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.3 18.7a9.5 9.5 0 1 1 13.4 0" className="mark-dial" />
      <path d="M18.7 18.7a9.5 9.5 0 0 0 2.1-3.5" className="mark-red" />
      <path d="M12 12 16.6 7.4" className="mark-needle" />
      <circle cx="12" cy="12" r="1.8" className="mark-hub" />
    </svg>
  );
}

const Header = forwardRef(function Header({ register, counts, onRegister, query, onQuery, onRollCall }, searchRef) {
  const canEdit = useCanEdit();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <h1 className="brand">
          <Mark />
          <span>Parc Fermé</span>
        </h1>

        <nav className="views" aria-label="Views">
          {Object.entries(REGISTERS).map(([id, r]) => (
            <button
              key={id}
              type="button"
              className={`view ${register === id ? 'is-active' : ''}`}
              aria-current={register === id ? 'page' : undefined}
              title={r.hint}
              onClick={() => onRegister(id)}
            >
              {r.short}
              <span className="view-count">{counts[id] ?? 0}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-tools">
          <label className="search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search cars</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search cars"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : (
              <kbd aria-hidden="true">/</kbd>
            )}
          </label>
          {canEdit && (
            <button type="button" className="btn btn-quiet" onClick={onRollCall}>
              Roll call
            </button>
          )}
        </div>
      </div>
    </header>
  );
});

export default Header;
