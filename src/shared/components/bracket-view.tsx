import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { cn } from '@/shared/lib/cn';
import { BRACKET_ROUNDS, THIRD_PLACE_MATCH, R32_LABELS } from '@/shared/data/bracket';
import { type SlotResolution } from '@/shared/lib/group-clinch';
import { computeBracketProjection, resolveBracketSlot } from '@/shared/lib/bracket-projection';
import type { Match, Team } from '@/shared/types/api';

interface Props {
  matches: Match[];
  teamMap: Map<number, Team> | undefined;
  /** Equipos del torneo — para confirmar 1°/2° de grupo en los slots R32. */
  teams?: Team[];
}

const TBD_TEAM: Team = {
  id: 0,
  code: 'TBD',
  flag: '🏳️',
  name: 'Por definir',
  group: null,
  confederation: null,
};

function getTeam(teamMap: Map<number, Team> | undefined, id: number): Team {
  return teamMap?.get(id) ?? TBD_TEAM;
}

function isTbd(team: Team) {
  return team.code === 'TBD' || team.id === 0;
}

function slotLabel(matchNumber: number, side: 'home' | 'away', roundIndex: number): string {
  if (roundIndex === 0) return R32_LABELS[matchNumber]?.[side] ?? 'Por definir';
  return 'Por definir';
}

// ─── Round accent colours — dual-mode pills ──────────────────────────────────
const ROUND_STYLES = [
  { label: 'R32',     pill: 'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',     accent: '#64748b', lineColor: 'rgba(100,116,139,0.45)' },
  { label: 'Octavos', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',         accent: '#3b82f6', lineColor: 'rgba(59,130,246,0.45)'  },
  { label: 'Cuartos', pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300', accent: '#8b5cf6', lineColor: 'rgba(139,92,246,0.45)'  },
  { label: 'Semis',   pill: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300', accent: '#f97316', lineColor: 'rgba(249,115,22,0.45)'  },
  { label: 'Final',   pill: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-300', accent: '#eab308', lineColor: 'rgba(234,179,8,0.55)'   },
];

// ─── Layout constants ─────────────────────────────────────────────────────────
const CARD_H    = 44;   // px — 2 rows × 22 px
const CARD_W    = 118;  // px
const SLOT_H    = 50;   // CARD_H + 6 px gap
const HALF_GAP  = 16;
const CONN_W    = 22;   // width of SVG connector between columns
const COL_GAP   = 0;    // columns abut the connectors directly

const TOTAL_H = 8 * SLOT_H + HALF_GAP + 8 * SLOT_H;

// ─── Position computation ────────────────────────────────────────────────────
function computePositions(): Map<number, { top: number; center: number }> {
  const pos = new Map<number, { top: number; center: number }>();

  const r32Order = BRACKET_ROUNDS[0].matches.map((m) => m.matchNumber);
  for (let i = 0; i < r32Order.length; i++) {
    const top =
      i < 8
        ? i * SLOT_H
        : 8 * SLOT_H + HALF_GAP + (i - 8) * SLOT_H;
    pos.set(r32Order[i], { top, center: top + CARD_H / 2 });
  }

  for (let ri = 1; ri < BRACKET_ROUNDS.length; ri++) {
    for (const bm of BRACKET_ROUNDS[ri].matches) {
      if (!bm.children) continue;
      const [c1, c2] = bm.children;
      const p1 = pos.get(c1);
      const p2 = pos.get(c2);
      if (!p1 || !p2) continue;
      const center = (p1.center + p2.center) / 2;
      pos.set(bm.matchNumber, { top: center - CARD_H / 2, center });
    }
  }

  return pos;
}

// ─── SVG connector between two columns ───────────────────────────────────────
function BracketConnectors({
  roundIndex,
  positions,
  lineColor,
}: {
  roundIndex: number;   // index of the RIGHT (parent) round
  positions: Map<number, { top: number; center: number }>;
  lineColor: string;
}) {
  const paths: React.ReactNode[] = [];

  for (const bm of BRACKET_ROUNDS[roundIndex].matches) {
    if (!bm.children) continue;
    const [c1, c2] = bm.children;
    const p1  = positions.get(c1);
    const p2  = positions.get(c2);
    const par = positions.get(bm.matchNumber);
    if (!p1 || !p2 || !par) continue;

    const mid = par.center;
    const cx  = CONN_W / 2;

    // Two arms from child centres → midpoint, then one line to parent
    paths.push(
      <path
        key={bm.matchNumber}
        d={`M 0 ${p1.center} H ${cx} V ${p2.center} H 0`}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />,
      <line
        key={`out-${bm.matchNumber}`}
        x1={cx} y1={mid} x2={CONN_W} y2={mid}
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />,
    );
  }

  return (
    <svg
      width={CONN_W}
      height={TOTAL_H}
      className="flex-shrink-0 self-end"
      style={{ marginBottom: 0 }}
    >
      {paths}
    </svg>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────
interface MatchCardProps {
  match: Match | undefined;
  matchNumber: number;
  roundIndex: number;
  teamMap: Map<number, Team> | undefined;
  /** Resolución proyectada del slot (equipo + si la posición está confirmada). */
  projectedHome?: SlotResolution | null;
  projectedAway?: SlotResolution | null;
}

function MatchCard({ match, matchNumber, roundIndex, teamMap, projectedHome, projectedAway }: MatchCardProps) {
  const homeTeam = match ? getTeam(teamMap, match.homeTeamId) : TBD_TEAM;
  const awayTeam = match ? getTeam(teamMap, match.awayTeamId) : TBD_TEAM;

  const homeTbd = isTbd(homeTeam);
  const awayTbd = isTbd(awayTeam);

  // Si el slot todavía no tiene equipo real pero el grupo ya proyecta uno
  // (1°/2° confirmado, o clasificado con orden provisional), lo mostramos.
  const homeProjected = homeTbd ? (projectedHome ?? null) : null;
  const awayProjected = awayTbd ? (projectedAway ?? null) : null;

  const isLive     = match?.status === 'live';
  const isFinished = match?.status === 'finished';
  const showScore  = (isLive || isFinished) && match?.homeScore != null;

  const homeLabel = homeTbd ? slotLabel(matchNumber, 'home', roundIndex) : homeTeam.code;
  const awayLabel = awayTbd ? slotLabel(matchNumber, 'away', roundIndex) : awayTeam.code;

  const homeWon = isFinished && match!.homeScore! > match!.awayScore!;
  const awayWon = isFinished && match!.awayScore! > match!.homeScore!;

  const rs = ROUND_STYLES[Math.min(roundIndex, ROUND_STYLES.length - 1)];
  const accentColor = rs.accent;

  const row = (
    tbd: boolean,
    label: string,
    team: Team,
    won: boolean,
    score: number | null | undefined,
    isTop: boolean,
    projected: SlotResolution | null,
  ) => (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 min-w-0 relative',
        isTop && 'border-b border-border',
        won && 'bg-accent/10 dark:bg-white/5',
      )}
      style={{ height: CARD_H / 2 }}
    >
      {tbd && projected ? (
        // Slot sin equipo en la DB pero proyectado por el grupo. Verde ✓ =
        // posición 1°/2° confirmada matemáticamente; ámbar ≈ = ya clasificado
        // pero con el orden 1°/2° todavía por definir (ubicación provisional).
        <>
          <TeamFlag code={projected.team.code} emoji={projected.team.flag} size={16} />
          <span className="flex-1 text-[9px] font-bold truncate leading-tight tracking-wide text-muted">
            {projected.team.code}
          </span>
          {projected.confirmed ? (
            <span
              className="text-[8px] text-green-500 dark:text-green-400 flex-shrink-0 font-black"
              title="Posición confirmada matemáticamente"
            >
              ✓
            </span>
          ) : (
            <span
              className="text-[8px] text-amber-500 dark:text-amber-400 flex-shrink-0 font-black"
              title="Clasificado · orden 1°/2° por definir (ubicación provisional)"
            >
              ≈
            </span>
          )}
        </>
      ) : tbd ? (
        <span className="text-[7px] leading-tight text-muted/50 flex-1 truncate italic">{label}</span>
      ) : (
        <>
          <TeamFlag code={team.code} emoji={team.flag} size={16} />
          <span className={cn(
            'flex-1 text-[9px] font-bold truncate leading-tight tracking-wide',
            won ? 'text-text' : 'text-muted',
          )}>
            {team.code}
          </span>
        </>
      )}
      {showScore && score != null && (
        <span className={cn(
          'text-[11px] font-black tabular-nums flex-shrink-0 min-w-[14px] text-right',
          isLive ? 'text-red-500 dark:text-red-400' : won ? 'text-accent' : 'text-muted/70',
        )}>
          {score}
        </span>
      )}
    </div>
  );

  const card = (
    <div
      className={cn(
        'flex flex-col overflow-hidden flex-shrink-0 relative',
        'rounded-lg border border-border bg-card',
        isLive && 'border-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
        !isLive && 'shadow-sm dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]',
      )}
      style={{
        width: CARD_W,
        height: CARD_H,
        // Left accent bar coloured by round (or red if live)
        borderLeft: `2.5px solid ${isLive ? '#ef4444' : accentColor}`,
      }}
    >
      {/* Subtle gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${accentColor}14 0%, transparent 60%)` }}
      />
      {row(homeTbd, homeLabel, homeTeam, homeWon, match?.homeScore, true, homeProjected)}
      {row(awayTbd, awayLabel, awayTeam, awayWon, match?.awayScore, false, awayProjected)}
    </div>
  );

  if (!match) return card;
  return (
    <Link to={`/matches/${match.id}`} className="hover:opacity-80 transition-opacity">
      {card}
    </Link>
  );
}

// ─── BracketView ──────────────────────────────────────────────────────────────
export function BracketView({ matches, teamMap, teams }: Props) {
  const matchByNum = useMemo(
    () => new Map(matches.map((m) => [m.matchNumber, m])),
    [matches],
  );

  // Proyección de la R32: 1°/2° de grupo (confirmados o clasificados
  // provisionales) + mejores terceros al cerrar la fase de grupos.
  const projection = useMemo(
    () => computeBracketProjection(teams ?? [], matches),
    [teams, matches],
  );

  const positions = useMemo(() => computePositions(), []);

  const rounds = [
    { matchNums: BRACKET_ROUNDS[0].matches.map((m) => m.matchNumber), ri: 0 },
    { matchNums: BRACKET_ROUNDS[1].matches.map((m) => m.matchNumber), ri: 1 },
    { matchNums: BRACKET_ROUNDS[2].matches.map((m) => m.matchNumber), ri: 2 },
    { matchNums: BRACKET_ROUNDS[3].matches.map((m) => m.matchNumber), ri: 3 },
    { matchNums: BRACKET_ROUNDS[4].matches.map((m) => m.matchNumber), ri: 4 },
  ];

  const thirdMatch = matchByNum.get(THIRD_PLACE_MATCH.matchNumber);

  return (
    <div className="pb-6">
      {/* Labels + bracket share a SINGLE horizontal scroll container, so the
          column headers stay aligned with their cards no matter how far the
          user scrolls. Previously the labels lived outside the scroll area
          and forced the page itself to widen, breaking the layout once the
          bracket extended past Cuartos. */}
      <div className="overflow-x-auto pb-3">
        <div style={{ minWidth: 'max-content' }}>
          {/* Round labels row */}
          <div
            className="flex items-center mb-3"
            style={{ gap: COL_GAP, paddingLeft: 4, paddingRight: 4 }}
          >
            {rounds.map(({ ri }) => {
              const rs = ROUND_STYLES[ri];
              // each label is centred over its column + half of both adjacent connectors
              const colW = ri === 0
                ? CARD_W + CONN_W / 2
                : ri === rounds.length - 1
                  ? CARD_W + CONN_W / 2
                  : CARD_W + CONN_W;
              return (
                <div key={ri} style={{ width: colW, flexShrink: 0 }} className="flex justify-center">
                  <span className={cn('text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full', rs.pill)}>
                    {rs.label}
                  </span>
                </div>
              );
            })}
          </div>

        <div
          className="flex items-start"
          style={{ gap: COL_GAP, padding: '0 4px 8px' }}
        >
          {rounds.map(({ matchNums, ri }, colIdx) => {
            return (
              <div key={ri} className="flex items-start flex-shrink-0">
                {/* Match column */}
                <div className="relative flex-shrink-0" style={{ width: CARD_W, height: TOTAL_H }}>
                  {matchNums.map((mn) => {
                    const p = positions.get(mn);
                    if (!p) return null;
                    return (
                      <div key={mn} className="absolute left-0" style={{ top: p.top }}>
                        <MatchCard
                          match={matchByNum.get(mn)}
                          matchNumber={mn}
                          roundIndex={ri}
                          teamMap={teamMap}
                          projectedHome={ri === 0 ? resolveBracketSlot(mn, 'home', projection) : null}
                          projectedAway={ri === 0 ? resolveBracketSlot(mn, 'away', projection) : null}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Connector SVG to the right (except after the last column) */}
                {colIdx < rounds.length - 1 && (
                  <div style={{ height: TOTAL_H, paddingTop: 0 }}>
                    <BracketConnectors
                      roundIndex={ri + 1}
                      positions={positions}
                      lineColor={ROUND_STYLES[ri + 1].lineColor}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Third-place match */}
      <div className="mt-3 px-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300/70">
            3er Puesto
          </span>
        </div>
        <MatchCard
          match={thirdMatch}
          matchNumber={THIRD_PLACE_MATCH.matchNumber}
          roundIndex={3}
          teamMap={teamMap}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 px-1 flex items-center gap-5 flex-wrap">
        {ROUND_STYLES.map((rs) => (
          <span key={rs.label} className="flex items-center gap-1.5 text-[9px] text-muted">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: rs.accent + '80', border: `1px solid ${rs.accent}80` }} />
            {rs.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40 border border-red-500/60 flex-shrink-0" />
          En vivo
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="text-green-500 dark:text-green-400 font-black">✓</span>
          Posición confirmada (1°/2° o 3ro)
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="text-amber-500 dark:text-amber-400 font-black">≈</span>
          Clasificado · orden por definir
        </span>
      </div>
    </div>
  );
}
