export type AccentKey =
  | 'gold' | 'mundial' | 'cyan' | 'violet' | 'orange'
  | 'coral' | 'magenta' | 'lime' | 'teal' | 'contrast';

export type AccentPalette = {
  key: AccentKey;
  name: string;
  color: string;
  on: string;
  a11y: boolean;
  highContrast?: boolean;
};

export const accentPalettes: Record<AccentKey, AccentPalette> = {
  gold:     { key: 'gold',     name: 'Dorado trofeo',     color: '#FFC857', on: '#0a0e1a', a11y: true  },
  // Verde México del trío anfitrión WC26 — los elementos tri-color
  // (.wc26-gradient-text, .wc26-stripe) son independientes de este acento.
  mundial:  { key: 'mundial',  name: 'Mundial 2026',      color: '#00C566', on: '#0a0e1a', a11y: true  },
  cyan:     { key: 'cyan',     name: 'Cyan eléctrico',    color: '#00D4FF', on: '#0a0e1a', a11y: true  },
  violet:   { key: 'violet',   name: 'Violeta moderno',   color: '#A78BFA', on: '#0a0e1a', a11y: true  },
  orange:   { key: 'orange',   name: 'Naranja deportivo', color: '#FF8C42', on: '#0a0e1a', a11y: true  },
  coral:    { key: 'coral',    name: 'Coral cálido',      color: '#FF6B6B', on: '#ffffff', a11y: false },
  magenta:  { key: 'magenta',  name: 'Magenta vibrante',  color: '#FF3D7F', on: '#ffffff', a11y: false },
  lime:     { key: 'lime',     name: 'Lime neón',         color: '#A3FF00', on: '#0a0e1a', a11y: false },
  teal:     { key: 'teal',     name: 'Teal fresco',       color: '#06D6A0', on: '#0a0e1a', a11y: false },
  contrast: { key: 'contrast', name: 'Alto contraste',    color: '#FFFF00', on: '#000000', a11y: true, highContrast: true },
};

export const accentList: AccentPalette[] = Object.values(accentPalettes);

export type ThemeMode = 'auto' | 'dark' | 'light';
export type ResolvedMode = 'dark' | 'light';

export const modeVars: Record<ResolvedMode, Record<string, string>> = {
  dark: {
    '--bg-deep':     '#0a0e1a',
    '--bg-card':     '#1a1f2e',
    '--bg-elevated': 'rgba(255,255,255,0.04)',
    '--border-color':'rgba(255,255,255,0.08)',
    '--text':        '#e8eef5',
    '--text-muted':  'rgba(232,238,245,0.55)',
  },
  light: {
    '--bg-deep':     '#f5f7fb',
    '--bg-card':     '#ffffff',
    '--bg-elevated': 'rgba(0,0,0,0.02)',
    '--border-color':'rgba(0,0,0,0.08)',
    '--text':        '#0a0e1a',
    '--text-muted':  'rgba(10,14,26,0.55)',
  },
};
