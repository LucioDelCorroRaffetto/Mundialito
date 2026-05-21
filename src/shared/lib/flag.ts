/**
 * Maps FIFA 3-letter codes to ISO 3166-1 alpha-2 codes used by flagcdn.com.
 * URL format: https://flagcdn.com/w{size}/{iso2}.png  (sizes: 16,20,24,32,40,48,64,80,96,112,128,160,192,256)
 * SVG format: https://flagcdn.com/{iso2}.svg
 */
const FIFA_TO_ISO2: Record<string, string> = {
  // CONMEBOL
  ARG: 'ar',
  BRA: 'br',
  URU: 'uy',
  COL: 'co',
  ECU: 'ec',
  PAR: 'py',
  // CONCACAF
  MEX: 'mx',
  USA: 'us',
  CAN: 'ca',
  PAN: 'pa',
  CRC: 'cr',
  JAM: 'jm',
  HAI: 'ht',
  CUW: 'cw',
  // UEFA
  ESP: 'es',
  ENG: 'gb-eng', // England has its own flag code
  SCO: 'gb-sct', // Scotland
  WAL: 'gb-wls', // Wales
  FRA: 'fr',
  GER: 'de',
  POR: 'pt',
  ITA: 'it',
  NED: 'nl',
  BEL: 'be',
  CRO: 'hr',
  SUI: 'ch',
  DEN: 'dk',
  POL: 'pl',
  AUT: 'at',
  SRB: 'rs',
  TUR: 'tr',
  NOR: 'no',
  SWE: 'se',
  CZE: 'cz',
  BIH: 'ba',
  HUN: 'hu',
  SVK: 'sk',
  SVN: 'si',
  ROU: 'ro',
  UKR: 'ua',
  GRE: 'gr',
  ALB: 'al',
  // AFC
  JPN: 'jp',
  KOR: 'kr',
  AUS: 'au',
  IRN: 'ir',
  KSA: 'sa',
  QAT: 'qa',
  UZB: 'uz',
  JOR: 'jo',
  CHN: 'cn',
  IND: 'in',
  // AFC
  IRQ: 'iq',
  // CAF
  MAR: 'ma',
  SEN: 'sn',
  EGY: 'eg',
  NGA: 'ng',
  ALG: 'dz',
  TUN: 'tn',
  CMR: 'cm',
  CIV: 'ci',
  GHA: 'gh',
  ZAF: 'za',
  CPV: 'cv',
  COD: 'cd',
  // OFC
  NZL: 'nz',
};

/**
 * flagcdn.com only serves a fixed set of PNG widths.
 * Requesting any other width (w24, w32, w48, w64...) returns 404.
 */
const FLAGCDN_WIDTHS = [20, 40, 80, 160, 320, 640, 1280] as const;

/** Snaps an arbitrary pixel size to the smallest valid flagcdn width >= it. */
function snapWidth(target: number): number {
  for (const w of FLAGCDN_WIDTHS) {
    if (w >= target) return w;
  }
  return FLAGCDN_WIDTHS[FLAGCDN_WIDTHS.length - 1];
}

/** Returns the flagcdn.com PNG URL for a FIFA country code. */
export function getFlagUrl(fifaCode: string, size: 16 | 20 | 24 | 32 | 40 | 48 | 64 = 32): string | null {
  const iso2 = FIFA_TO_ISO2[fifaCode?.toUpperCase()];
  if (!iso2) return null;
  return `https://flagcdn.com/w${snapWidth(size)}/${iso2}.png`;
}

/** Returns a 2x (retina) flagcdn.com URL. */
export function getFlagUrl2x(fifaCode: string, size: 16 | 20 | 24 | 32 | 40 | 48 | 64 = 32): string | null {
  const iso2 = FIFA_TO_ISO2[fifaCode?.toUpperCase()];
  if (!iso2) return null;
  return `https://flagcdn.com/w${snapWidth(size * 2)}/${iso2}.png`;
}
