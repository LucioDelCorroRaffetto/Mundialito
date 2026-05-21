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
  // OFC
  NZL: 'nz',
};

/** Returns the flagcdn.com PNG URL for a FIFA country code. */
export function getFlagUrl(fifaCode: string, size: 16 | 20 | 24 | 32 | 40 | 48 | 64 = 32): string | null {
  const iso2 = FIFA_TO_ISO2[fifaCode?.toUpperCase()];
  if (!iso2) return null;
  return `https://flagcdn.com/w${size}/${iso2}.png`;
}

/** Returns a 2x (retina) flagcdn.com URL. */
export function getFlagUrl2x(fifaCode: string, size: 16 | 20 | 24 | 32 | 40 | 48 | 64 = 32): string | null {
  const iso2 = FIFA_TO_ISO2[fifaCode?.toUpperCase()];
  if (!iso2) return null;
  const size2x = (size * 2) as 32 | 40 | 48 | 64 | 80 | 96 | 128;
  return `https://flagcdn.com/w${size2x}/${iso2}.png`;
}
