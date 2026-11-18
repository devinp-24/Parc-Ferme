import { X } from 'lucide-react';
import { CLASS_NOTES, DEALERS, GROUPS, SORTS } from '@shared';
import Menu from './Menu.jsx';
import FilterPanel from './FilterPanel.jsx';
import { EMPTY_FILTERS } from '../lib/view.js';

// The controls for the grid sit on the grid, not in the masthead: grouping,
// order, filters, the filters in force (each one removable), and how many
// cars that leaves.

function Removable({ label, title, onRemove }) {
  return (
    <button type="button" className="token" title={title} onClick={onRemove}>
      {label}
      <X size={12} aria-label="remove" />
    </button>
  );
}

export default function Controls({ register, groupBy, onGroupBy, sort, onSort, filters, onFilters, query, onQuery, newCount, count }) {
  const without = (key, value) => onFilters({ ...filters, [key]: filters[key].filter((v) => v !== value) });
  const any =
    filters.classes.length || filters.dealers.length || filters.regions.length || filters.inStock || filters.onlyNew || query.trim();

  return (
    <div className="controls">
      <div className="controls-main">
        {register !== 'dealers' && <Menu label="Grouped by" value={groupBy} options={GROUPS} onChange={onGroupBy} />}
        <Menu label="Sorted by" value={sort} options={SORTS} onChange={onSort} />
        <FilterPanel filters={filters} onChange={onFilters} newCount={newCount} />
        {any ? (
          <div className="tokens">
            {query.trim() && <Removable label={`“${query.trim()}”`} onRemove={() => onQuery('')} />}
            {filters.classes.map((c) => (
              <Removable key={c} label={c} title={CLASS_NOTES[c]} onRemove={() => without('classes', c)} />
            ))}
            {filters.dealers.map((d) => (
              <Removable key={d} label={DEALERS[d].label} onRemove={() => without('dealers', d)} />
            ))}
            {filters.regions.map((r) => (
              <Removable key={r} label={r} onRemove={() => without('regions', r)} />
            ))}
            {filters.inStock && (
              <Removable label="In a dealership today" onRemove={() => onFilters({ ...filters, inStock: false })} />
            )}
            {filters.onlyNew && <Removable label="New cars" onRemove={() => onFilters({ ...filters, onlyNew: false })} />}
            <button
              type="button"
              className="link quiet"
              onClick={() => {
                onFilters(EMPTY_FILTERS);
                onQuery('');
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
      <p className="tally" aria-live="polite">
        {count === 1 ? '1 car' : `${count} cars`}
      </p>
    </div>
  );
}
