import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CLASSES, CLASS_NOTES, DEALERS, REGIONS } from '@shared';
import { EMPTY_FILTERS, countFilters } from '../lib/view.js';

// Filters as toggles in a panel. Within a row they combine with "or" (Gr.3 or
// Gr.4); across rows with "and" (Gr.3 cars sold at Brand Central).

const DEALER_KEYS = ['brand', 'legend', 'used', 'dlc', 'reward'];

function ToggleRow({ title, keys, labels, notes, selected, onToggle }) {
  return (
    <fieldset className="filter-row">
      <legend>{title}</legend>
      <div className="toggles">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`toggle ${selected.includes(k) ? 'is-on' : ''}`}
            aria-pressed={selected.includes(k)}
            title={notes?.[k]}
            onClick={() => onToggle(k)}
          >
            {labels?.[k] ?? k}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function FilterPanel({ filters, onChange, newCount }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const count = countFilters(filters);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = (key, value) => {
    const list = filters[key];
    onChange({ ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };

  return (
    <div className="filters" ref={wrapRef}>
      <button
        type="button"
        className={`menu-trigger ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="menu-value">Filters</span>
        {count > 0 && <span className="count-badge">{count}</span>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="filter-pop" role="dialog" aria-label="Filters">
          <ToggleRow
            title="Class"
            keys={CLASSES}
            notes={CLASS_NOTES}
            selected={filters.classes}
            onToggle={(v) => toggle('classes', v)}
          />
          <ToggleRow
            title="Where to buy"
            keys={DEALER_KEYS}
            labels={Object.fromEntries(DEALER_KEYS.map((k) => [k, DEALERS[k].label]))}
            selected={filters.dealers}
            onToggle={(v) => toggle('dealers', v)}
          />
          <ToggleRow title="Region" keys={REGIONS} selected={filters.regions} onToggle={(v) => toggle('regions', v)} />
          <fieldset className="filter-row">
            <legend>Show only</legend>
            <div className="toggles">
              <button
                type="button"
                className={`toggle ${filters.inStock ? 'is-on' : ''}`}
                aria-pressed={filters.inStock}
                onClick={() => onChange({ ...filters, inStock: !filters.inStock })}
              >
                In a dealership today
              </button>
              <button
                type="button"
                className={`toggle ${filters.onlyNew ? 'is-on' : ''}`}
                aria-pressed={filters.onlyNew}
                disabled={!newCount && !filters.onlyNew}
                onClick={() => onChange({ ...filters, onlyNew: !filters.onlyNew })}
              >
                New since the last update{newCount ? ` (${newCount})` : ''}
              </button>
            </div>
          </fieldset>
          <footer className="filter-foot">
            <button type="button" className="link quiet" disabled={!count} onClick={() => onChange(EMPTY_FILTERS)}>
              Clear filters
            </button>
            <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(false)}>
              Done
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
