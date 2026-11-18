import { motion } from 'framer-motion';
import { Mark } from './Header.jsx';

export function Toast({ toast, onUndo }) {
  if (!toast) return null;
  return (
    <motion.div
      key={toast.id}
      className="toast"
      role="status"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <span>{toast.message}</span>
      {toast.undo && (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      )}
    </motion.div>
  );
}

const FIRST_SYNC_STEPS = [
  'Every car in the game, Brand Central prices, and four years of daily Used Cars and Legend Cars stock, from gt7info',
  "Specs and photographs from Polyphony's official car list",
  'Current Brand Central prices from the Gran Turismo Wiki',
];

export function FirstRun({ step, error, onRetry }) {
  return (
    <div className="first-run">
      <div className="first-run-card">
        <p className="brand">
          <Mark />
          <span>Parc Fermé</span>
        </p>
        {error ? (
          <>
            <p className="first-run-step is-error">{error}</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="first-run-step">
              <span className="spinner" aria-hidden="true" />
              {step || 'Building your catalogue'}
            </p>
            <p className="first-run-note">The first start reads three sources, which takes about fifteen seconds:</p>
            <ol className="first-run-list">
              {FIRST_SYNC_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
