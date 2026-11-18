import { formatCompact, formatCredits, formatDay } from '@shared';

// Every stint a car has spent in a dealership since gt7info began recording
// (March 2022), drawn as a bar at its asking price. Read left to right it
// answers the two questions that matter for a rotating dealership: how often
// does this car come back, and what does it usually cost when it does?
// Sold-out stints are drawn hollow: the car was listed but could not be bought.

const DAY = 86_400_000;

export default function HistoryChart({ stints, today }) {
  if (!stints || stints.length === 0) return null;
  const W = 560;
  const H = 128;
  const top = 16;
  const bottom = 24;
  const start = Date.parse(stints[0].from);
  const end = Math.max(Date.parse(today), Date.parse(stints[stints.length - 1].to) + DAY);
  const span = Math.max(DAY * 30, end - start);
  const prices = stints.map((s) => s.cr);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = hi === lo ? hi * 0.25 || 1 : (hi - lo) * 0.25;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const x = (t) => ((t - start) / span) * W;
  const y = (v) => top + (1 - (v - yMin) / (yMax - yMin)) * (H - top - bottom);

  const years = [];
  for (let yr = new Date(start).getUTCFullYear() + 1; Date.UTC(yr, 0, 1) < end; yr += 1) years.push(yr);

  const last = stints[stints.length - 1];
  return (
    <figure className="history">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${stints.length} dealership stints; latest ${formatCredits(last.cr)} credits on ${formatDay(last.to)}`}>
        {[hi, lo].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="history-guide" />
        ))}
        {years.map((yr) => (
          <g key={yr}>
            <line x1={x(Date.UTC(yr, 0, 1))} x2={x(Date.UTC(yr, 0, 1))} y1={top - 6} y2={H - bottom + 4} className="history-year" />
            <text x={x(Date.UTC(yr, 0, 1)) + 4} y={H - 6} className="history-label">{yr}</text>
          </g>
        ))}
        {/* A faint step line through every stint's price shows the trend
            between visits; the bars show when the car was actually there. */}
        <path
          className="history-trend"
          d={stints
            .map((s, i) => {
              const xs = x(Date.parse(s.from));
              const xe = x(Date.parse(s.to) + DAY);
              return `${i === 0 ? 'M' : 'L'} ${xs.toFixed(1)} ${y(s.cr).toFixed(1)} L ${xe.toFixed(1)} ${y(s.cr).toFixed(1)}`;
            })
            .join(' ')}
        />
        {stints.map((s, i) => {
          const x1 = x(Date.parse(s.from));
          const x2 = Math.max(x1 + 4, x(Date.parse(s.to) + DAY));
          const latest = i === stints.length - 1;
          return (
            <rect
              key={`${s.from}-${s.cr}`}
              x={x1}
              y={y(s.cr) - 4}
              width={x2 - x1}
              height="8"
              rx="2"
              className={`history-bar ${s.state === 'soldout' ? 'is-soldout' : ''} ${latest ? 'is-latest' : ''}`}
            >
              <title>
                {`${formatDay(s.from)} to ${formatDay(s.to)}, Cr. ${formatCredits(s.cr)}${s.state === 'soldout' ? ', sold out' : ''}`}
              </title>
            </rect>
          );
        })}
        <line x1={x(Date.parse(today))} x2={x(Date.parse(today))} y1={top - 6} y2={H - bottom + 4} className="history-today" />
      </svg>
      <figcaption className="history-axis">
        <span>{formatDay(stints[0].from, { year: true })}</span>
        <span>
          Cr. {formatCompact(lo)}
          {hi !== lo ? ` – ${formatCompact(hi)}` : ''}
        </span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
}
