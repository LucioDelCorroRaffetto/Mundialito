/**
 * Curated palette of primary/secondary colours for each of the 48
 * teams in the 2026 FIFA World Cup, keyed by FIFA tri-letter code
 * (the same `team.code` the API ships).
 *
 * Why two colours? In the match-detail score card we paint a low-alpha
 * left→right gradient using the *primary* of each team. A few national
 * palettes have white as their dominant colour (France, England, etc.) —
 * white on a white/dark card just disappears, so for those teams we
 * promote the secondary (blue, red, …) into `primary` and keep white as
 * `secondary` for accents.
 *
 * Sources: Wikipedia infoboxes + brand kits where federations publish
 * one. Hex values are rounded to common web swatches — we don't need
 * Pantone fidelity, just something that *reads* like the flag.
 */
export interface TeamColors {
  /** Hue used for the dominant gradient stop. Never pure white — see note above. */
  primary: string;
  /** Secondary accent (often the second stripe of the flag). */
  secondary: string;
}

/** Fallback when a code isn't in the table (e.g. TBD knock-out slots). */
export const DEFAULT_TEAM_COLORS: TeamColors = {
  primary: '#888888',
  secondary: '#444444',
};

/**
 * Mapping by FIFA code. Codes follow the FIFA tri-letter convention
 * (ARG, BRA, DEU, …) so they line up with `team.code` from the API.
 */
export const TEAM_COLORS: Record<string, TeamColors> = {
  // ── CONMEBOL ──────────────────────────────────────────────────
  ARG: { primary: '#75AADB', secondary: '#FFFFFF' }, // celeste
  BRA: { primary: '#FEDF00', secondary: '#009C3B' },
  URU: { primary: '#5CBCEC', secondary: '#FFFFFF' },
  COL: { primary: '#FCD116', secondary: '#003893' },
  ECU: { primary: '#FFD100', secondary: '#0033A0' },
  PAR: { primary: '#D52B1E', secondary: '#0038A8' },
  // (Bolivia, Chile, Perú, Venezuela no clasificaron al cierre de la fase.)

  // ── CONCACAF (hosts + región) ────────────────────────────────
  USA: { primary: '#0A3161', secondary: '#B31942' }, // anfitrión
  MEX: { primary: '#006847', secondary: '#CE1126' }, // anfitrión
  CAN: { primary: '#D80621', secondary: '#FFFFFF' }, // anfitrión
  CRC: { primary: '#002B7F', secondary: '#CE1126' },
  PAN: { primary: '#005AA7', secondary: '#D21034' },
  HAI: { primary: '#00209F', secondary: '#D21034' },
  JAM: { primary: '#009B3A', secondary: '#FED100' },
  HON: { primary: '#0073CF', secondary: '#FFFFFF' },
  CUW: { primary: '#002B7F', secondary: '#F9E814' },
  SUR: { primary: '#377E3F', secondary: '#B40A2D' },

  // ── UEFA ──────────────────────────────────────────────────────
  ESP: { primary: '#AA151B', secondary: '#F1BF00' },
  FRA: { primary: '#0055A4', secondary: '#EF4135' }, // blanco como 3°
  ENG: { primary: '#CE1124', secondary: '#FFFFFF' }, // cruz de San Jorge
  GER: { primary: '#000000', secondary: '#DD0000' },
  DEU: { primary: '#000000', secondary: '#DD0000' }, // alias ISO 3166
  ITA: { primary: '#008C45', secondary: '#CD212A' }, // verde + rojo
  POR: { primary: '#006600', secondary: '#FF0000' },
  NED: { primary: '#FF6900', secondary: '#21468B' },
  BEL: { primary: '#FAE042', secondary: '#000000' },
  SUI: { primary: '#D52B1E', secondary: '#FFFFFF' },
  AUT: { primary: '#ED2939', secondary: '#FFFFFF' },
  CRO: { primary: '#171796', secondary: '#FF0000' },
  POL: { primary: '#DC143C', secondary: '#FFFFFF' },
  CZE: { primary: '#11457E', secondary: '#D7141A' },
  DEN: { primary: '#C60C30', secondary: '#FFFFFF' },
  NOR: { primary: '#BA0C2F', secondary: '#00205B' },
  TUR: { primary: '#E30A17', secondary: '#FFFFFF' },
  SRB: { primary: '#C6363C', secondary: '#0C4076' },
  SCO: { primary: '#0065BD', secondary: '#FFFFFF' },
  UKR: { primary: '#0057B7', secondary: '#FFD700' },

  // ── AFC ───────────────────────────────────────────────────────
  JPN: { primary: '#0033A0', secondary: '#BC002D' }, // azul samurái
  KOR: { primary: '#CD2E3A', secondary: '#0047A0' },
  AUS: { primary: '#FFCD00', secondary: '#00843D' }, // socceroos
  IRN: { primary: '#239F40', secondary: '#DA0000' },
  KSA: { primary: '#006C35', secondary: '#FFFFFF' },
  QAT: { primary: '#8A1538', secondary: '#FFFFFF' },
  UAE: { primary: '#00732F', secondary: '#FF0000' },
  UZB: { primary: '#1EB53A', secondary: '#0099B5' },
  JOR: { primary: '#000000', secondary: '#CE1126' },
  IRQ: { primary: '#CE1126', secondary: '#007A3D' },

  // ── CAF ───────────────────────────────────────────────────────
  MAR: { primary: '#C1272D', secondary: '#006233' },
  SEN: { primary: '#00853F', secondary: '#FDEF42' },
  EGY: { primary: '#CE1126', secondary: '#000000' },
  NGA: { primary: '#008751', secondary: '#FFFFFF' },
  CIV: { primary: '#FF8200', secondary: '#009A44' },
  CMR: { primary: '#007A33', secondary: '#CE1126' },
  GHA: { primary: '#CE1126', secondary: '#FCD116' },
  ALG: { primary: '#006233', secondary: '#FFFFFF' },
  TUN: { primary: '#E70013', secondary: '#FFFFFF' },
  RSA: { primary: '#007A4D', secondary: '#FFB612' },
  CPV: { primary: '#003893', secondary: '#FFFFFF' },

  // ── OFC ───────────────────────────────────────────────────────
  NZL: { primary: '#012169', secondary: '#CC142B' },
};

/**
 * Look up a team's palette by FIFA code. Returns the fallback if the
 * code isn't mapped (TBD slots, future expansions, typos in the feed).
 */
export function getTeamColors(code: string): TeamColors {
  if (!code) return DEFAULT_TEAM_COLORS;
  return TEAM_COLORS[code.toUpperCase()] ?? DEFAULT_TEAM_COLORS;
}

/**
 * Convert a `#RRGGBB` hex into an `rgba(r, g, b, a)` string. Tolerates
 * 3-digit shorthand and missing `#`. Returns transparent black on a
 * malformed input so the caller doesn't paint garbage.
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
