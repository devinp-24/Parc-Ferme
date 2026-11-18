import { useEffect, useRef, useState } from 'react';

// The rev counter. Collection completion is the needle; the face is drawn the
// way a real tachometer's is: fine graduations every 2.5%, majors every 10%
// with condensed numerals, and a painted redline over the last tenth.
//
// On load the needle does what a cluster does at ignition: it sweeps to the
// redline and falls back to where you actually are. That is the page's one
// orchestrated moment; afterwards the needle only moves when your garage does.

const C = 160; // centre
const START = 135; // degrees clockwise from 3 o'clock: the 0 mark, lower left
const SWEEP = 270;

const rad = (deg) => (deg * Math.PI) / 180;
const at = (deg, r) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const angle = (pct) => START + SWEEP * pct;

function arc(from, to, r) {
  const [x1, y1] = at(angle(from), r);
  const [x2, y2] = at(angle(to), r);
  const large = SWEEP * (to - from) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Instrument({ value, total }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const [needle, setNeedle] = useState({ pct: 0, ms: 0 });
  const [fill, setFill] = useState(0);
  // Marked only once the sweep has actually finished. Marking it at the start
  // meant React's development double-mount cancelled the sweep on the first
  // pass and skipped it on the second.
  const ignited = useRef(false);

  useEffect(() => {
    if (ignited.current || prefersReducedMotion()) {
      setNeedle({ pct, ms: ignited.current ? 700 : 0 });
      setFill(pct);
      ignited.current = true;
      return undefined;
    }
    // Ignition: up to the redline, a beat, then down to the real reading.
    const timers = [
      setTimeout(() => setNeedle({ pct: 1, ms: 650 }), 120),
      setTimeout(() => {
        setNeedle({ pct, ms: 1100 });
        setFill(pct);
        ignited.current = true;
      }, 120 + 650 + 140),
    ];
    return () => timers.forEach(clearTimeout);
  }, [pct]);

  const ticks = [];
  for (let i = 0; i <= 40; i += 1) {
    const p = i / 40;
    const major = i % 4 === 0;
    const red = p >= 0.9;
    const [x1, y1] = at(angle(p), major ? 133 : 139);
    const [x2, y2] = at(angle(p), 147);
    ticks.push(
      <line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`tick ${major ? 'major' : ''} ${red ? 'red' : ''}`} />
    );
    if (major) {
      const [tx, ty] = at(angle(p), 116);
      ticks.push(
        <text key={`n${i}`} x={tx} y={ty} className={`numeral ${red ? 'red' : ''}`} textAnchor="middle" dominantBaseline="central">
          {i / 4}
        </text>
      );
    }
  }

  const percent = Math.round(pct * 1000) / 10;
  const whole = Math.floor(percent);
  const tenth = Math.round((percent - whole) * 10) % 10;

  return (
    <figure className="instrument" role="img" aria-label={`${value} of ${total} cars collected, ${percent}%`}>
      <svg viewBox="0 0 320 320" aria-hidden="true">
        <circle cx={C} cy={C} r="157" className="bezel" />
        <circle cx={C} cy={C} r="152" className="face" />
        <path d={arc(0.9, 1, 150)} className="redline" />
        <path d={arc(0, 1, 127)} className="track" />
        <path
          d={arc(0, 1, 127)}
          pathLength="1"
          className="fill"
          style={{ strokeDasharray: '1 2', strokeDashoffset: 1 - fill, opacity: fill > 0.002 ? 1 : 0 }}
        />
        {ticks}
        {/* Below the hub: the one place the needle never sweeps across. */}
        <text x={C} y={C + 30} textAnchor="middle" className="unit">
          ×10%
        </text>
        <g
          className="needle"
          style={{
            // Drawn pointing along +x around the origin; moved to the centre
            // and turned. Angles stay within 135-405, so a transition always
            // travels along the dial, never the short way round.
            transform: `translate(${C}px, ${C}px) rotate(${angle(needle.pct)}deg)`,
            transitionDuration: `${needle.ms}ms`,
          }}
        >
          <path d="M -24 -3.2 L 0 -3.4 L 131 -0.9 L 134 0 L 131 0.9 L 0 3.4 L -24 3.2 Z" />
        </g>
        <circle cx={C} cy={C} r="12" className="hub" />
        <circle cx={C} cy={C} r="3" className="hub-pin" />
      </svg>
      <figcaption className="readout">
        <span className="readout-value">
          {whole}
          <span className="readout-tenth">.{tenth}</span>
          <span className="readout-unit">%</span>
        </span>
        <span className="readout-label">collected</span>
      </figcaption>
    </figure>
  );
}
