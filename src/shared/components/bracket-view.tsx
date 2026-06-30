import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { cn } from '@/shared/lib/cn';
import { BRACKET_ROUNDS, THIRD_PLACE_MATCH, R32_LABELS } from '@/shared/data/bracket';
import {
  computeBracketProjection,
  resolveAdvancingSlot,
} from '@/shared/lib/bracket-projection';
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

// ─── Round accent colours ─────────────────────────────────────────────────────
const ROUND_STYLES = [
  { label: 'R32',     accent: '#64748b', lineColor: 'rgba(100,116,139,0.5)', headerBg: 'rgba(100,116,139,0.12)', headerText: '#94a3b8' },
  { label: 'Octavos', accent: '#3b82f6', lineColor: 'rgba(59,130,246,0.5)',  headerBg: 'rgba(59,130,246,0.12)',  headerText: '#60a5fa' },
  { label: 'Cuartos', accent: '#8b5cf6', lineColor: 'rgba(139,92,246,0.5)',  headerBg: 'rgba(139,92,246,0.12)', headerText: '#a78bfa' },
  { label: 'Semis',   accent: '#f97316', lineColor: 'rgba(249,115,22,0.5)',  headerBg: 'rgba(249,115,22,0.12)', headerText: '#fb923c' },
  { label: 'Final',   accent: '#eab308', lineColor: 'rgba(234,179,8,0.6)',   headerBg: 'rgba(234,179,8,0.14)',  headerText: '#facc15' },
];

// ─── Layout constants ─────────────────────────────────────────────────────────
const CARD_H   = 58;   // px — 2 rows × 29 px
const CARD_W   = 152;  // px
const SLOT_H   = 66;   // CARD_H + 8 px gap
const HALF_GAP = 18;
const CONN_W   = 28;   // width of SVG connector between columns
const COL_GAP  = 0;

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
  roundIndex: number;
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
    <svg width={CONN_W} height={TOTAL_H} className="flex-shrink-0 self-end">
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
  projectedHome?: Team | null;
  projectedAway?: Team | null;
}

function MatchCard({ match, matchNumber, roundIndex, teamMap, projectedHome, projectedAway }: MatchCardProps) {
  const homeTeam = match ? getTeam(teamMap, match.homeTeamId) : TBD_TEAM;
  const awayTeam = match ? getTeam(teamMap, match.awayTeamId) : TBD_TEAM;

  const homeTbd = isTbd(homeTeam);
  const awayTbd = isTbd(awayTeam);

  const homeProjected = homeTbd ? (projectedHome ?? null) : null;
  const awayProjected = awayTbd ? (projectedAway ?? null) : null;

  const isLive     = match?.status === 'live';
  const isFinished = match?.status === 'finished';
  const showScore  = (isLive || isFinished) && match?.homeScore != null;
  const decidedByPen = isFinished && !!match?.decidedByPenalties;

  const homeLabel = homeTbd ? slotLabel(matchNumber, 'home', roundIndex) : homeTeam.code;
  const awayLabel = awayTbd ? slotLabel(matchNumber, 'away', roundIndex) : awayTeam.code;

  // Bump model: el sync sumó +1 al ganador de penales para indicarlo en el score.
  // Revertimos al resultado de reglamento (empate) para el display.
  const rawHome = match?.homeScore ?? null;
  const rawAway = match?.awayScore ?? null;
  const displayHomeScore = (decidedByPen && rawHome != null && rawAway != null && rawHome !== rawAway)
    ? Math.min(rawHome, rawAway) : rawHome;
  const displayAwayScore = (decidedByPen && rawHome != null && rawAway != null && rawHome !== rawAway)
    ? Math.min(rawHome, rawAway) : rawAway;

  // El ganador se determina por el score original (bumpeado) o, si no hay bump,
  // permanece indeterminado desde el match row (no tenemos el timeline aquí).
  const homeWon = isFinished && rawHome != null && rawAway != null && rawHome > rawAway;
  const awayWon = isFinished && rawHome != null && rawAway != null && rawAway > rawHome;

  const rs = ROUND_STYLES[Math.min(roundIndex, ROUND_STYLES.length - 1)];
  const accentColor = rs.accent;

  const ROW_H = CARD_H / 2; // 29px

  const row = (
    tbd: boolean,
    label: string,
    team: Team,
    won: boolean,
    score: number | null | undefined,
    isTop: boolean,
    projected: Team | null,
  ) => {
    const displayTeam = (!tbd) ? team : (projected ?? null);
    const isProjected = tbd && !!projected;
    const isBlank = tbd && !projected;

    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 min-w-0 relative transition-colors',
          isTop && 'border-b border-border/60',
          won && 'bg-white/[0.04]',
        )}
        style={{ height: ROW_H }}
      >
        {/* Flag */}
        {displayTeam && !isBlank ? (
          <TeamFlag
            code={displayTeam.code}
            emoji={displayTeam.flag}
            size={20}
            className={cn('flex-shrink-0', isProjected && 'opacity-60')}
          />
        ) : (
          <div className="w-5 h-5 flex-shrink-0 rounded-sm bg-border/40" />
        )}

        {/* Name block */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0">
          {isBlank ? (
            <span className="text-[8px] leading-tight text-muted/40 italic truncate">{label}</span>
          ) : displayTeam ? (
            <>
              <span className={cn(
                'text-[10px] font-bold leading-tight tracking-wide truncate',
                isProjected ? 'text-muted/70' : won ? 'text-text' : 'text-muted',
              )}>
                {displayTeam.code}
              </span>
              <span className={cn(
                'text-[7.5px] leading-tight truncate',
                isProjected ? 'text-muted/40' : 'text-muted/60',
              )}>
                {displayTeam.name}
              </span>
            </>
          ) : null}
        </div>

        {/* Score */}
        {showScore && score != null && (
          <div className="flex-shrink-0 flex items-center gap-0.5">
            <span className={cn(
              'text-[13px] font-black tabular-nums leading-none',
              isLive ? 'text-red-400' : won ? 'text-accent' : 'text-muted/60',
            )}>
              {score}
            </span>
            {won && decidedByPen && (
              <span className="text-[6.5px] font-bold text-muted/50 leading-none mb-px">p</span>
            )}
          </div>
        )}

        {/* Live pulse dot */}
        {isLive && isTop && (
          <span
            className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
            aria-label="En vivo"
          />
        )}
      </div>
    );
  };

  const card = (
    <div
      className={cn(
        'flex flex-col overflow-hidden flex-shrink-0 relative',
        'rounded-xl border border-border/80 bg-card',
        isLive
          ? 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
          : 'shadow-[0_2px_12px_rgba(0,0,0,0.25)]',
      )}
      style={{
        width: CARD_W,
        height: CARD_H,
        borderLeft: `3px solid ${isLive ? '#ef4444' : accentColor}`,
      }}
    >
      {/* Gradient overlay — more visible than before */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(120deg, ${accentColor}1a 0%, transparent 55%)` }}
      />
      {row(homeTbd, homeLabel, homeTeam, homeWon, displayHomeScore, true, homeProjected)}
      {row(awayTbd, awayLabel, awayTeam, awayWon, displayAwayScore, false, awayProjected)}
    </div>
  );

  if (!match) return card;
  return (
    <Link to={`/matches/${match.id}`} className="hover:opacity-80 transition-opacity active:scale-[0.98]">
      {card}
    </Link>
  );
}

// ─── Round header ─────────────────────────────────────────────────────────────
function RoundHeader({ rs, width }: { rs: typeof ROUND_STYLES[number]; width: number }) {
  return (
    <div
      className="flex justify-center items-center flex-shrink-0 rounded-lg"
      style={{
        width,
        height: 28,
        background: rs.headerBg,
        border: `1px solid ${rs.accent}30`,
      }}
    >
      <span
        className="text-[9px] font-black uppercase tracking-[0.12em]"
        style={{ color: rs.headerText }}
      >
        {rs.label}
      </span>
    </div>
  );
}

// ─── BracketView ──────────────────────────────────────────────────────────────
export function BracketView({ matches, teamMap, teams }: Props) {
  const matchByNum = useMemo(
    () => new Map(matches.map((m) => [m.matchNumber, m])),
    [matches],
  );

  const projection = useMemo(
    () => computeBracketProjection(teams ?? [], matches),
    [teams, matches],
  );

  const slotCtx = useMemo(
    () => ({ matchByNum, teamMap, projection }),
    [matchByNum, teamMap, projection],
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
      <div className="overflow-x-auto pb-3">
        <div style={{ minWidth: 'max-content' }}>

          {/* Round headers */}
          <div className="flex items-center gap-1 mb-3" style={{ padding: '0 4px' }}>
            {rounds.map(({ ri }, colIdx) => {
              const rs = ROUND_STYLES[ri];
              const colW = ri === 0
                ? CARD_W + CONN_W / 2
                : ri === rounds.length - 1
                  ? CARD_W + CONN_W / 2
                  : CARD_W + CONN_W;
              return (
                <RoundHeader
                  key={ri}
                  rs={rs}
                  width={colIdx === 0 ? colW - 4 : colW}
                />
              );
            })}
          </div>

          {/* Bracket columns */}
          <div className="flex items-start" style={{ gap: COL_GAP, padding: '0 4px 8px' }}>
            {rounds.map(({ matchNums, ri }, colIdx) => (
              <div key={ri} className="flex items-start flex-shrink-0">
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
                          projectedHome={resolveAdvancingSlot(mn, 'home', slotCtx)}
                          projectedAway={resolveAdvancingSlot(mn, 'away', slotCtx)}
                        />
                      </div>
                    );
                  })}
                </div>

                {colIdx < rounds.length - 1 && (
                  <div style={{ height: TOTAL_H }}>
                    <BracketConnectors
                      roundIndex={ri + 1}
                      positions={positions}
                      lineColor={ROUND_STYLES[ri + 1].lineColor}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Third-place match */}
      <div className="mt-4 px-1">
        <div
          className="inline-flex items-center px-3 py-1 rounded-lg mb-2"
          style={{
            background: ROUND_STYLES[3].headerBg,
            border: `1px solid ${ROUND_STYLES[3].accent}30`,
          }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-[0.12em]"
            style={{ color: ROUND_STYLES[3].headerText }}
          >
            3er Puesto
          </span>
        </div>
        <MatchCard
          match={thirdMatch}
          matchNumber={THIRD_PLACE_MATCH.matchNumber}
          roundIndex={3}
          teamMap={teamMap}
          projectedHome={resolveAdvancingSlot(THIRD_PLACE_MATCH.matchNumber, 'home', slotCtx)}
          projectedAway={resolveAdvancingSlot(THIRD_PLACE_MATCH.matchNumber, 'away', slotCtx)}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 px-1 flex items-center gap-4 flex-wrap">
        {ROUND_STYLES.map((rs) => (
          <span key={rs.label} className="flex items-center gap-1.5 text-[8.5px]" style={{ color: rs.headerText }}>
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: rs.accent + '70', border: `1px solid ${rs.accent}60` }}
            />
            {rs.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[8.5px] text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500/60 border border-red-500/60 flex-shrink-0" />
          En vivo
        </span>
      </div>
    </div>
  );
}
