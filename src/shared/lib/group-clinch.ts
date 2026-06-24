/**
 * group-clinch.ts — ¿qué equipos tienen MATEMÁTICAMENTE asegurada su posición
 * de grupo (1° o 2°) antes de que el grupo termine?
 *
 * Se usa para ir cargando los slots "1° Grp X" / "2° Grp X" del cuadro
 * (bracket) en cuanto un puesto queda confirmado, sin esperar a que se jueguen
 * los 6 partidos del grupo.
 *
 * ── Garantía de diseño ──────────────────────────────────────────────────────
 * El engine es CONSERVADOR: nunca marca un puesto como confirmado si existe
 * algún resultado posible de los partidos restantes que lo cambie. Es decir,
 * jamás produce un falso positivo. A cambio, en casos raros que dependen de un
 * desempate fino (diferencia de gol con marcador todavía abierto) puede
 * confirmar un poquito más tarde de lo teóricamente posible. Preferimos
 * mostrar de menos a mostrar algo equivocado.
 *
 * ── Cómo decide ─────────────────────────────────────────────────────────────
 * Enumera TODOS los resultados posibles (victoria/empate/derrota) de los
 * partidos del grupo que aún no terminaron — a lo sumo 3^6 = 729 escenarios —
 * y proyecta los puntos de cada equipo en cada escenario. Un equipo está:
 *   • Confirmado 1°  → si en NINGÚN escenario alguien puede igualarlo o
 *                      superarlo (puntos, y desempate cuando es resoluble).
 *   • Confirmado 2°  → si está confirmado entre los 2 primeros Y en todos los
 *                      escenarios hay siempre exactamente un equipo por encima
 *                      (nunca puede ser 1°).
 *
 * Desempates FIFA (Mundial 2026 — CAMBIÓ respecto de Mundiales previos): el
 * ENFRENTAMIENTO DIRECTO va PRIMERO, y recién después los criterios globales.
 * Orden: puntos → (entre los empatados) pts en el duelo directo → dif. de gol
 * del duelo → goles del duelo → dif. de gol total → goles a favor total → fair
 * play → ranking FIFA.
 *
 * Consecuencia para el clinch: un duelo directo YA JUGADO y no empatado decide
 * el orden de ese par en cualquier escenario donde queden igualados en puntos,
 * sin importar los partidos que les resten contra OTROS rivales (la dif. de gol
 * global es criterio POSTERIOR al duelo). Por eso un equipo puede confirmar su
 * 1°/2° aun con partidos pendientes, si ya le ganó el duelo a su único rival que
 * podría alcanzarlo en puntos. Los desempates por dif. de gol GLOBAL, en cambio,
 * solo se consideran "decididos" cuando los dos equipos ya jugaron sus 3
 * partidos (si a alguno le resta uno, el marcador todavía puede moverla).
 */
import type { Match, Team } from '@/shared/types/api';
import { computeStandings } from '@/shared/lib/standings';

export interface GroupClinch {
  /** Equipo con el 1° puesto matemáticamente asegurado, o null. */
  first: Team | null;
  /** Equipo con el 2° puesto (exacto) matemáticamente asegurado, o null. */
  second: Team | null;
  /**
   * Resolución para el slot "1° Grp X" del bracket. Puede ser:
   *  • confirmed=true  → posición 1° asegurada matemáticamente (✓ verde).
   *  • confirmed=false → el equipo YA está clasificado (top-2 asegurado) pero su
   *    orden 1°/2° todavía no está definido; lo ubicamos provisionalmente por la
   *    tabla actual (ámbar "orden por definir").
   */
  slot1: SlotResolution | null;
  /** Ídem para el slot "2° Grp X". */
  slot2: SlotResolution | null;
}

export interface SlotResolution {
  team: Team;
  /** true = posición exacta confirmada; false = clasificado, orden provisional. */
  confirmed: boolean;
}

interface Stats {
  teamId: number;
  pts: number;
  gd: number;
  gf: number;
  /** true cuando el equipo ya jugó sus 3 partidos del grupo. */
  done: boolean;
}

/** Resultado de un partido pendiente para enumerar: puntos del local/visitante. */
const OUTCOMES: ReadonlyArray<readonly [number, number]> = [
  [3, 0], // gana local
  [1, 1], // empate
  [0, 3], // gana visitante
];

function pointsFor(home: number, away: number): readonly [number, number] {
  if (home > away) return [3, 0];
  if (home < away) return [0, 3];
  return [1, 1];
}

/**
 * Resultado del ENFRENTAMIENTO DIRECTO ya jugado entre `a` y `b`, primer
 * desempate FIFA 2026. Devuelve < 0 si `a` quedó por encima de `b` por el duelo,
 * > 0 si `b` por encima, 0 si el duelo no se jugó o terminó empatado (no separa).
 *
 * Es ESTABLE aunque a alguno le resten partidos: bajo la regla 2026 el duelo es
 * criterio anterior a la dif. de gol global, así que un duelo jugado y no
 * empatado fija el orden del par en cualquier escenario donde estén igualados en
 * puntos, sin importar los partidos contra otros rivales. En fase de grupos se
 * juega un único partido por par, así que comparar los goles del duelo alcanza.
 */
function headToHeadResult(a: Stats, b: Stats, h2h: Map<string, [number, number]>): number {
  const key = a.teamId < b.teamId ? `${a.teamId}-${b.teamId}` : `${b.teamId}-${a.teamId}`;
  const rec = h2h.get(key);
  if (!rec) return 0; // no se jugaron entre sí (todavía)
  const [loGoals, hiGoals] = rec;
  const aGoals = a.teamId < b.teamId ? loGoals : hiGoals;
  const bGoals = a.teamId < b.teamId ? hiGoals : loGoals;
  if (aGoals === bGoals) return 0; // duelo empatado → no separa por este criterio
  return bGoals - aGoals; // <0 → a arriba; >0 → b arriba
}

/**
 * Desempate GLOBAL entre dos equipos igualados en puntos cuyo duelo directo NO
 * los separó (empatado o no jugado). Solo válido cuando AMBOS ya jugaron sus 3
 * partidos (si a alguno le resta uno, el marcador puede mover la dif. de gol).
 * Devuelve < 0 si `a` por encima, > 0 si `b`, 0 si ni esto los separa (fair play
 * / ranking FIFA no modelados → empate irresoluble, ambiguo aguas arriba).
 */
function compareGlobal(a: Stats, b: Stats): number {
  if (a.gd !== b.gd) return b.gd - a.gd; // dif. de gol general
  if (a.gf !== b.gf) return b.gf - a.gf; // goles a favor generales
  return 0; // fair play / ranking FIFA: no modelados → irresoluble
}

export function computeGroupClinch(teams: Team[], allMatches: Match[], group: string): GroupClinch {
  const groupTeams = teams.filter((t) => t.group === group);
  if (groupTeams.length !== 4) return { first: null, second: null, slot1: null, slot2: null };

  const groupMatches = allMatches.filter((m) => m.group === group);
  const finished = groupMatches.filter(
    (m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null,
  );
  const pending = groupMatches.filter(
    (m) => !(m.status === 'finished' && m.homeScore != null && m.awayScore != null),
  );

  // Stats base de los partidos ya jugados.
  const base = new Map<number, Stats>(
    groupTeams.map((t) => [t.id, { teamId: t.id, pts: 0, gd: 0, gf: 0, done: true }]),
  );
  // Duelo directo: clave "menorId-mayorId" → [golesMenorId, golesMayorId].
  const h2h = new Map<string, [number, number]>();

  for (const m of finished) {
    const h = base.get(m.homeTeamId);
    const a = base.get(m.awayTeamId);
    if (!h || !a) continue;
    const hs = m.homeScore!;
    const as = m.awayScore!;
    h.gf += hs; h.gd += hs - as;
    a.gf += as; a.gd += as - hs;
    const [hp, ap] = pointsFor(hs, as);
    h.pts += hp; a.pts += ap;

    const lo = Math.min(m.homeTeamId, m.awayTeamId);
    const key = `${lo}-${Math.max(m.homeTeamId, m.awayTeamId)}`;
    const rec = h2h.get(key) ?? [0, 0];
    if (m.homeTeamId === lo) { rec[0] += hs; rec[1] += as; } else { rec[0] += as; rec[1] += hs; }
    h2h.set(key, rec);
  }

  // Un equipo "done" (jugó sus 3) solo si no aparece en ningún partido pendiente.
  for (const m of pending) {
    base.get(m.homeTeamId) && (base.get(m.homeTeamId)!.done = false);
    base.get(m.awayTeamId) && (base.get(m.awayTeamId)!.done = false);
  }

  const k = pending.length;
  // Por cada equipo del grupo, el peor (couldAbove) y el optimista (mustAbove)
  // recuento de rivales por encima, a lo largo de TODOS los escenarios.
  const maxCouldAbove = new Map<number, number>(groupTeams.map((t) => [t.id, 0]));
  const minMustAbove = new Map<number, number>(groupTeams.map((t) => [t.id, Infinity]));

  const total = 3 ** k;
  for (let scenario = 0; scenario < total; scenario++) {
    // Proyectar puntos de este escenario sobre la base.
    const proj = new Map<number, number>(groupTeams.map((t) => [t.id, base.get(t.id)!.pts]));
    let s = scenario;
    for (let i = 0; i < k; i++) {
      const [hp, ap] = OUTCOMES[s % 3];
      s = Math.floor(s / 3);
      const m = pending[i];
      proj.set(m.homeTeamId, (proj.get(m.homeTeamId) ?? 0) + hp);
      proj.set(m.awayTeamId, (proj.get(m.awayTeamId) ?? 0) + ap);
    }

    for (const t of groupTeams) {
      const tPts = proj.get(t.id)!;
      const tStats = base.get(t.id)!;
      let could = 0; // rivales que PODRÍAN quedar por encima (pesimista para t)
      let must = 0;  // rivales que SEGURO quedan por encima (optimista para t)
      for (const o of groupTeams) {
        if (o.id === t.id) continue;
        const oPts = proj.get(o.id)!;
        if (oPts > tPts) { could++; must++; continue; }
        if (oPts < tPts) continue;
        // Igualados en puntos en este escenario. Desempate FIFA 2026: duelo
        // directo PRIMERO (estable aunque resten partidos), luego DG global.
        const oStats = base.get(o.id)!;
        const h2hCmp = headToHeadResult(tStats, oStats, h2h);
        if (h2hCmp > 0) {
          could++; must++;                       // o ganó el duelo → seguro arriba
        } else if (h2hCmp < 0) {
          // t ganó el duelo directo → t arriba en todo escenario con este empate.
        } else if (tStats.done && oStats.done) {
          // Sin duelo decisivo y ambos terminaron: cae a DG/GF global.
          const cmp = compareGlobal(tStats, oStats);
          if (cmp > 0) { could++; must++; }      // o queda decididamente arriba
          else if (cmp === 0) could++;           // empate irresoluble → podría ir arriba
        } else {
          could++; // duelo no decisivo y resta algún partido: DG global puede mover
        }
      }
      maxCouldAbove.set(t.id, Math.max(maxCouldAbove.get(t.id)!, could));
      minMustAbove.set(t.id, Math.min(minMustAbove.get(t.id)!, must));
    }
  }

  let first: Team | null = null;
  let second: Team | null = null;
  const qualified: Team[] = []; // top-2 asegurado (could<=1), orden exacto aparte
  for (const t of groupTeams) {
    const could = maxCouldAbove.get(t.id)!;
    const must = minMustAbove.get(t.id)!;
    if (could === 0) first = t;                       // nadie nunca por encima → 1°
    else if (could <= 1 && must >= 1) second = t;     // siempre exactamente 1 arriba → 2°
    if (could <= 1) qualified.push(t);                // a lo sumo 1 arriba → clasificado
  }

  // Asignar los slots 1°/2°: primero las posiciones exactas (confirmadas), y el
  // resto de los clasificados de forma provisional según la tabla ACTUAL. Para
  // que el orden provisional coincida con lo que muestra la pestaña Grupos y
  // respete el desempate 2026 (duelo directo primero), reutilizamos computeStandings.
  const standingRank = new Map(
    computeStandings(groupTeams, finished, group).map((r, i) => [r.team.id, i]),
  );
  const order = (a: Team, b: Team) =>
    (standingRank.get(a.id) ?? 99) - (standingRank.get(b.id) ?? 99);
  const placedIds = new Set<number>();
  let slot1: SlotResolution | null = null;
  let slot2: SlotResolution | null = null;
  if (first) { slot1 = { team: first, confirmed: true }; placedIds.add(first.id); }
  if (second) { slot2 = { team: second, confirmed: true }; placedIds.add(second.id); }

  // Clasificados sin posición exacta → llenar los slots libres por orden de tabla.
  const provisional = qualified.filter((t) => !placedIds.has(t.id)).sort(order);
  let p = 0;
  if (!slot1 && p < provisional.length) slot1 = { team: provisional[p++], confirmed: false };
  if (!slot2 && p < provisional.length) slot2 = { team: provisional[p++], confirmed: false };

  return { first, second, slot1, slot2 };
}

/** Resuelve un grupo → clinch para los 12 grupos de una. */
export function computeAllGroupClinches(
  teams: Team[],
  matches: Match[],
): Map<string, GroupClinch> {
  const groups = new Set<string>();
  for (const t of teams) if (t.group) groups.add(t.group);
  const out = new Map<string, GroupClinch>();
  for (const g of groups) out.set(g, computeGroupClinch(teams, matches, g));
  return out;
}

/**
 * Dado un label de slot del bracket ("1° Grp E", "2° Grp B"), devuelve el
 * equipo confirmado para ese slot, o null si todavía no está definido.
 * "Mejor 3ro" y cualquier otro label devuelven null (los terceros dependen de
 * los 12 grupos a la vez y se resuelven al cerrar la fase de grupos).
 */
export function resolveSlotTeam(
  label: string,
  clinches: Map<string, GroupClinch>,
): SlotResolution | null {
  const m = /^([12])°\s*Grp\s*([A-L])$/.exec(label.trim());
  if (!m) return null;
  const clinch = clinches.get(m[2]);
  if (!clinch) return null;
  return m[1] === '1' ? clinch.slot1 : clinch.slot2;
}
