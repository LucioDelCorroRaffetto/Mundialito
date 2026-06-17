/**
 * Parser de "position" de infoboxes de Wikipedia de futbolistas. Wikipedia
 * publica el campo en formato variado:
 *
 *   position = [[Striker (association football)|Striker]]
 *   position = [[Forward (association football)]]
 *   position = Left winger, left-back
 *   position = [[Winger (association football)|Winger]] / [[Forward]]
 *   position = {{nowrap|[[Right winger]] / [[Right-back]]}}
 *
 * Devolvemos un array de roles cortos (ST, LW, RW, CB, LB, etc.) — ese
 * es el vocabulario que entiende `LineupPitch`. Si la posición no matchea
 * nada conocido, devolvemos [] (el caller usa el `position` base como
 * fallback).
 */

export type SlotRole = 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST' | 'SS';

// Pairs ordenados de "needle" → role. El primero que matchea (longest-first
// para que "centre-forward" no matchee "forward" cuando ambos existen) gana.
const TEXT_TO_ROLE: Array<[string, SlotRole]> = [
  // Forwards — granular antes que generic
  ['centre-forward',      'ST'],
  ['center-forward',      'ST'],
  ['centre forward',      'ST'],
  ['center forward',      'ST'],
  ['striker',             'ST'],
  ['second striker',      'SS'],
  ['support striker',     'SS'],
  ['inside forward',      'SS'],
  ['left winger',         'LW'],
  ['right winger',        'RW'],
  ['winger',              'LW'], // sin lado → asumimos LW como default
  ['forward',             'ST'], // último — más generic
  // Mids
  ['attacking midfielder','CAM'],
  ['attacking midfield',  'CAM'],
  ['defensive midfielder','CDM'],
  ['defensive midfield',  'CDM'],
  ['central midfielder',  'CM'],
  ['central midfield',    'CM'],
  ['left midfielder',     'LM'],
  ['left midfield',       'LM'],
  ['right midfielder',    'RM'],
  ['right midfield',      'RM'],
  ['midfielder',          'CM'],
  ['midfield',            'CM'],
  // Defenders
  ['left wing-back',      'LWB'],
  ['left wingback',       'LWB'],
  ['right wing-back',     'RWB'],
  ['right wingback',      'RWB'],
  ['centre-back',         'CB'],
  ['center-back',         'CB'],
  ['centre back',         'CB'],
  ['center back',         'CB'],
  ['left-back',           'LB'],
  ['left back',           'LB'],
  ['right-back',          'RB'],
  ['right back',          'RB'],
  ['fullback',            'LB'], // sin lado → default LB; el slot assigner ajusta
  ['full-back',           'LB'],
  ['defender',            'CB'], // generic → CB
  // Keeper
  ['goalkeeper',          'GK'],
  ['goalie',              'GK'],
  ['keeper',              'GK'],
];

/**
 * Toma el valor crudo del campo `position` del infobox (puede incluir
 * wikilinks, templates, separadores) y devuelve un set único de roles
 * cortos. Vacío si nada matchea.
 */
export function parsePositionRoles(raw: string | null | undefined): SlotRole[] {
  if (!raw) return [];
  // 1. Strip wikilinks: [[X|Y]] → Y, [[X]] → X
  let s = raw.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
  // 2. Strip templates: {{nowrap|X}} → X
  s = s.replace(/\{\{[^|}]*\|([^}]+)\}\}/g, '$1');
  s = s.replace(/\{\{[^}]*\}\}/g, ' ');
  // 3. Strip HTML
  s = s.replace(/<[^>]+>/g, ' ');
  // 4. Normalize whitespace
  s = s.toLowerCase().replace(/\s+/g, ' ').trim();

  // 5. Match each role token. Una posición puede aparecer múltiples veces
  // (ej. "Striker / Centre-forward") → dedup.
  const found = new Set<SlotRole>();
  for (const [needle, role] of TEXT_TO_ROLE) {
    if (s.includes(needle)) {
      found.add(role);
      // Reemplazamos lo encontrado por espacios para que el siguiente
      // match (más corto) no agarre la misma frase. Ej. una vez que
      // matcheamos "centre-forward" no queremos volver a matchear
      // "forward".
      s = s.split(needle).join(' '.repeat(needle.length));
    }
  }
  return [...found];
}

/**
 * Extrae el VALOR del campo `position = ...` del wikitext de un artículo
 * de futbolista. Devuelve null si no lo encuentra.
 */
export function extractPositionFromWikitext(text: string): string | null {
  const m = text.match(/^\s*\|\s*position\s*=\s*([^\n]+)/im);
  if (!m) return null;
  let v = m[1].trim();
  // El valor puede continuar en líneas siguientes si tiene wikilinks
  // multilínea, pero en práctica casi nunca pasa — el `position` siempre
  // ocupa una sola línea.
  // Strip trailing pipe content (next field) — defensa por si el regex
  // engancha de más.
  v = v.split('|').slice(0, -1).join('|') || v.split('|')[0];
  return v.trim() || null;
}

/** Mapping de short role → posición base, para validación. */
export function baseFromRole(role: SlotRole): 'GK' | 'DEF' | 'MID' | 'FWD' {
  if (role === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(role)) return 'DEF';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(role)) return 'MID';
  return 'FWD';
}
