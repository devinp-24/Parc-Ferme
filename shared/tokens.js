// Design tokens: the single source of truth (npm run tokens regenerates the CSS).
//
// Colour is earned. The interface itself is black, white and grey, and the
// colour on the page comes from the cars you own: a car you do not own is
// shown in grey, as GT7's own Collection shows it, and turns to colour when it
// is yours. The ground is true black because Polyphony's studio photographs
// fade to black at their edges, so every car stands in its own pool of light.
//
// Red appears in exactly one role: the redline. It is painted on the dial's
// last tenth, lights the last segment of a group's progress, and marks a car
// that leaves a dealership tonight. Nothing else is coloured.

export const colors = {
  night: '#000000', // page ground
  panel: '#121212', // menus, the ledger, the detail view
  raised: '#1A1A1A', // a step above a panel: inputs on panels, hover rows
  rule: '#262626', // hairlines
  ruleStrong: '#3A3A3A',

  ink: '#F1F0ED', // text, the needle, the primary button
  ash: '#A3A29D', // secondary text, 8.2:1 on night
  smoke: '#868580', // tertiary text, 5.4:1 on night, 4.8:1 on panel

  redline: '#EE4433', // 5.5:1 on night

  scrim: 'rgba(0, 0, 0, 0.78)',
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 56,
};

// One family. Mona Sans is variable in weight and width, so the condensed
// numerals on the dial, the running text and the wide headings -- set the way
// car brochures set model names -- are all the same typeface.
export const fonts = {
  sans: "'Mona Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
};

export const widths = {
  condensed: '78%',
  normal: '100%',
  wide: '116%',
  widest: '125%',
};

export const motion = {
  fast: '140ms',
  base: '220ms',
  slow: '420ms',
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
};
