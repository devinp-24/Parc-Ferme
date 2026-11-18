import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A button plus a listbox rather than a native <select>, whose menu is painted
// in the operating system's chrome where no CSS can reach. Keyboard behaviour
// is implemented explicitly: arrows move, Enter/Space commit, Escape closes,
// Tab or an outside click dismisses. The trigger reads as a sentence fragment
// -- "Grouped by Manufacturer" -- rather than a boxed control.

export default function Menu({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const ids = Object.keys(options);

  useEffect(() => {
    if (!open) return undefined;
    setActive(Math.max(0, ids.indexOf(value)));
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const commit = (id) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % ids.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + ids.length) % ids.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(ids.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(ids[active]);
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="menu" ref={wrapRef}>
      <button
        type="button"
        className={`menu-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} ${options[value]?.label ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="menu-key">{label}</span>
        <span className="menu-value">{options[value]?.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className="menu-list" role="listbox" aria-label={label} tabIndex={-1}>
          {ids.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={id === value}
                className={`menu-option ${id === value ? 'is-selected' : ''} ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(id)}
              >
                {options[id].label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
