export type AccentKey =
  | 'gold' | 'mundial' | 'cyan' | 'violet' | 'orange'
  | 'coral' | 'magenta' | 'lime' | 'teal'
  | 'sky' | 'rose' | 'contrast';

export type AccentPalette = {
  key: AccentKey;
  /** Etiqueta humana del theme picker. */
  name: string;
  /** Color de acento (HEX). Se usa como `--accent`. */
  color: string;
  /** Color del texto/icono SOBRE el acento (`--accent-on`). Elegido para AA. */
  on: string;
  /** true ⇒ cumple WCAG AA: `on`/`color` ≥ 4.5 (texto) y `color`/`--bg-deep` ≥ 3 (UI). */
  a11y: boolean;
  highContrast?: boolean;
};

/*
 * Contraste WCAG (auditoría 2026-06-21). Ratios calculados con la fórmula
 * estándar (luminancia relativa). UI = acento sobre `--bg-deep` (#0a0e1a),
 * mínimo AA ≥ 3. Texto = color `on` sobre el acento, mínimo AA ≥ 4.5.
 *
 *   accent     on        UI/bg-deep   on/accent
 *   gold       #0a0e1a   12.48        12.48
 *   mundial    #0a0e1a    8.38         8.38
 *   cyan       #0a0e1a   10.77        10.77
 *   violet     #0a0e1a    7.04         7.04
 *   orange     #0a0e1a    8.29         8.29
 *   coral      #0a0e1a    6.91         6.91   (antes on=#fff ⇒ 2.78 ✗)
 *   magenta    #0a0e1a    5.67         5.67   (antes on=#fff ⇒ 3.38 ✗)
 *   lime       #0a0e1a   15.40        15.40
 *   teal       #0a0e1a   10.09        10.09
 *   sky        #0a0e1a    8.81         8.81   (nueva)
 *   rose       #0a0e1a    7.71         7.71   (nueva)
 *   contrast   #000000   17.86        19.56
 */

export const accentPalettes: Record<AccentKey, AccentPalette> = {
  gold:     { key: 'gold',     name: 'Dorado trofeo',     color: '#FFC857', on: '#0a0e1a', a11y: true  },
  // Verde México del trío anfitrión WC26 — los elementos tri-color
  // (.wc26-gradient-text, .wc26-stripe) son independientes de este acento.
  mundial:  { key: 'mundial',  name: 'Mundial 2026',      color: '#00C566', on: '#0a0e1a', a11y: true  },
  cyan:     { key: 'cyan',     name: 'Cyan eléctrico',    color: '#00D4FF', on: '#0a0e1a', a11y: true  },
  violet:   { key: 'violet',   name: 'Violeta moderno',   color: '#A78BFA', on: '#0a0e1a', a11y: true  },
  orange:   { key: 'orange',   name: 'Naranja deportivo', color: '#FF8C42', on: '#0a0e1a', a11y: true  },
  // coral/magenta usaban texto BLANCO sobre el acento: 2.78 y 3.38 ⇒ fallaban
  // AA. Con texto OSCURO (#0a0e1a) sobre el mismo color suben a 6.91 y 5.67 ⇒ AA.
  coral:    { key: 'coral',    name: 'Coral cálido',      color: '#FF6B6B', on: '#0a0e1a', a11y: true  },
  magenta:  { key: 'magenta',  name: 'Magenta vibrante',  color: '#FF3D7F', on: '#0a0e1a', a11y: true  },
  // lime/teal ya cumplían AA con texto oscuro (15.40 / 10.09); el flag estaba
  // marcado en false de más. Corregido tras medir el contraste real.
  lime:     { key: 'lime',     name: 'Lime neón',         color: '#A3FF00', on: '#0a0e1a', a11y: true  },
  teal:     { key: 'teal',     name: 'Teal fresco',       color: '#06D6A0', on: '#0a0e1a', a11y: true  },
  // Nuevas (coherentes con el set, AA): cielo frío + rosa cálido.
  sky:      { key: 'sky',      name: 'Cielo brillante',   color: '#5AB8FF', on: '#0a0e1a', a11y: true  },
  rose:     { key: 'rose',     name: 'Rosa flamenco',     color: '#FF7A99', on: '#0a0e1a', a11y: true  },
  contrast: { key: 'contrast', name: 'Alto contraste',    color: '#FFFF00', on: '#000000', a11y: true, highContrast: true },
};

export const accentList: AccentPalette[] = Object.values(accentPalettes);

export type ThemeMode = 'auto' | 'dark' | 'light';
export type ResolvedMode = 'dark' | 'light';

export const modeVars: Record<ResolvedMode, Record<string, string>> = {
  dark: {
    // Tinte sutil del acento sobre el fondo base (probado 2026-07-03,
    // Sesión 8 del plan de mejoras) — 4% mantiene el margen de los ratios
    // auditados arriba (todos ≥5.67 UI/bg-deep, sobra para absorber el
    // shift de luminancia de un color-mix al 4%).
    '--bg-deep':     'color-mix(in srgb, #0a0e1a 96%, var(--accent))',
    '--bg-card':     '#1a1f2e',
    '--bg-elevated': 'rgba(255,255,255,0.04)',
    '--border-color':'rgba(255,255,255,0.08)',
    '--text':        '#e8eef5',
    // 0.55 ya pasaba AA (5.46/deep, 5.04/card); 0.60 da más aire sin verse duro.
    '--text-muted':  'rgba(232,238,245,0.60)',
  },
  light: {
    '--bg-deep':     '#f5f7fb',
    '--bg-card':     '#ffffff',
    '--bg-elevated': 'rgba(0,0,0,0.04)',
    // Borde un pelín más marcado en claro: 0.08 sobre blanco casi no se veía.
    '--border-color':'rgba(0,0,0,0.10)',
    '--text':        '#0a0e1a',
    // 0.55 FALLABA AA en claro (4.12/deep, 4.23/card). 0.64 ⇒ 4.86/5.05 ✓.
    '--text-muted':  'rgba(10,14,26,0.64)',
  },
};
