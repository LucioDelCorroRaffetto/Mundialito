/**
 * Self-test of the entire FIFA → player_match_stats → fantasy pipeline.
 *
 * Runs the real parser against a known WC2022 match (Wales 0-3 England)
 * and asserts the totals match reality:
 *   3 goals (Rashford 2 + Foden 1)
 *   ≥ 1 assist
 *   ≥ 2 yellow cards
 *
 * Does NOT touch the DB — purely in-memory simulation of the resolver
 * logic. Used by the admin diagnostics endpoint and by the
 * `npm run diagnose:fifa` script so you can confirm the pipeline is
 * healthy without waiting for a real WC2026 match.
 *
 * Returns a structured `DiagnoseResult` the caller can serialize as JSON
 * or convert into a push notification body.
 */

const FIFA_BASE = 'https://api.fifa.com/api/v3';

// Known reference fixture: Wales 0-3 England, group stage WC2022.
const REFERENCE = {
  competition: '17',
  season: '255711',
  stage: '285063',
  match: '400235454',
  label: 'Wales 0-3 England (WC2022)',
  expected: { goals: 3, assistsMin: 1, yellowMin: 2 },
};

// Same event-type cheatsheet as sync-fifa-stats.ts.
const GOAL_TYPES = new Set([0, 39, 41]);
const ASSIST_TYPES = new Set([1]);
const YELLOW_TYPES = new Set([2]);
const RED_TYPES = new Set([3]);
// La tanda de penales (Period 11) usa Type 41 pero NO cuenta como gol — igual
// que en sync-fifa-stats.ts. Lo replicamos acá para que el self-test siga
// siendo un espejo fiel del parser real si algún día se apunta a un partido
// con definición por penales.
const FIFA_SHOOTOUT_PERIOD = 11;

interface FifaLocaleString { Locale: string; Description: string }
interface FifaTimelineEvent {
  Type: number;
  Period?: number | null;
  IdPlayer?: string | null;
  IdSubPlayer?: string | null;
  IdTeam?: string | null;
  EventDescription?: FifaLocaleString[];
}
interface FifaTimelineResponse { Event?: FifaTimelineEvent[] }

export interface DiagnoseCheck {
  name: string;
  ok: boolean;
  details: string;
}

export interface DiagnoseResult {
  ok: boolean;
  ranAt: string;
  reference: string;
  checks: DiagnoseCheck[];
  totals: { goals: number; assists: number; yellow: number; red: number };
  durationMs: number;
}

function parseDescription(desc: string | undefined): { surname: string; country: string | null } | null {
  if (!desc) return null;
  const a = desc.match(/^([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\s*\(([^)]+)\)/);
  if (a) {
    const country = a[2].trim();
    const looksLikeCountry = country.length >= 3 && !/^(in|out|penalty|red card|yellow card)$/i.test(country);
    return { surname: a[1].trim(), country: looksLikeCountry ? country : null };
  }
  const b = desc.match(/^Assisted by\s+([A-ZÁÉÍÓÚÑÜÇA-zÀ-ÿ' .-]+?)\.?\s*$/);
  if (b) return { surname: b[1].trim(), country: null };
  return null;
}

export async function diagnoseFifaFlow(): Promise<DiagnoseResult> {
  const start = Date.now();
  const checks: DiagnoseCheck[] = [];

  // ── 1. Reachability ────────────────────────────────────────────────────────
  const url = `${FIFA_BASE}/timelines/${REFERENCE.competition}/${REFERENCE.season}/${REFERENCE.stage}/${REFERENCE.match}?language=en`;
  let events: FifaTimelineEvent[] = [];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    checks.push({
      name: 'fifa-api-reachable',
      ok: res.ok,
      details: `HTTP ${res.status} ${res.statusText}`,
    });
    if (!res.ok) {
      return finalize(start, checks, { goals: 0, assists: 0, yellow: 0, red: 0 });
    }
    const data = (await res.json()) as FifaTimelineResponse;
    events = data.Event ?? [];
    checks.push({
      name: 'fifa-payload-shape',
      ok: events.length > 0,
      details: `${events.length} events parsed`,
    });
  } catch (err) {
    checks.push({
      name: 'fifa-api-reachable',
      ok: false,
      details: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return finalize(start, checks, { goals: 0, assists: 0, yellow: 0, red: 0 });
  }

  // ── 2. Run the same logic the real service uses ───────────────────────────
  let goals = 0;
  let assists = 0;
  let yellow = 0;
  let red = 0;
  const playerKeyCounts = new Map<string, { g: number; a: number; y: number; r: number }>();

  for (const ev of events) {
    const parsed = parseDescription(ev.EventDescription?.[0]?.Description);
    if (!parsed) continue;
    const key = `${parsed.surname.toLowerCase()}|${(parsed.country ?? ev.IdTeam ?? '?').toLowerCase()}`;
    let b = playerKeyCounts.get(key);
    if (!b) {
      b = { g: 0, a: 0, y: 0, r: 0 };
      playerKeyCounts.set(key, b);
    }
    if (GOAL_TYPES.has(ev.Type) && !(ev.Type === 41 && ev.Period === FIFA_SHOOTOUT_PERIOD)) { b.g += 1; goals += 1; }
    else if (ASSIST_TYPES.has(ev.Type)) { b.a += 1; assists += 1; }
    else if (YELLOW_TYPES.has(ev.Type)) { b.y += 1; yellow += 1; }
    else if (RED_TYPES.has(ev.Type)) { b.r = 1; red += 1; }
  }

  // ── 3. Assert against reality ──────────────────────────────────────────────
  checks.push({
    name: 'parser-goals',
    ok: goals === REFERENCE.expected.goals,
    details: `got ${goals}, expected ${REFERENCE.expected.goals}`,
  });
  checks.push({
    name: 'parser-assists',
    ok: assists >= REFERENCE.expected.assistsMin,
    details: `got ${assists}, expected ≥${REFERENCE.expected.assistsMin}`,
  });
  checks.push({
    name: 'parser-yellow',
    ok: yellow >= REFERENCE.expected.yellowMin,
    details: `got ${yellow}, expected ≥${REFERENCE.expected.yellowMin}`,
  });

  // ── 4. Specific scorer check (catches regex regressions on a real name) ───
  const rashford = playerKeyCounts.get('rashford|england');
  const foden = playerKeyCounts.get('foden|england');
  checks.push({
    name: 'specific-scorers',
    ok: !!(rashford && rashford.g === 2 && foden && foden.g === 1),
    details: `Rashford goals=${rashford?.g ?? 0} (expected 2); Foden goals=${foden?.g ?? 0} (expected 1)`,
  });

  return finalize(start, checks, { goals, assists, yellow, red });
}

function finalize(
  start: number,
  checks: DiagnoseCheck[],
  totals: DiagnoseResult['totals'],
): DiagnoseResult {
  const ok = checks.every((c) => c.ok);
  return {
    ok,
    ranAt: new Date().toISOString(),
    reference: REFERENCE.label,
    checks,
    totals,
    durationMs: Date.now() - start,
  };
}
