import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { cn } from '@/shared/lib/cn';
import { BRACKET_ROUNDS, THIRD_PLACE_MATCH, R32_LABELS } from '@/shared/data/bracket';
import type { Match, Team } from '@/shared/types/api';

interface Props {
  matches: Match[];
  teamMap: Map<number, Team> | undefined;
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

// ─── Layout constants ────────────────────────────────────────────────────────
const CARD_H  = 64;  // px — fixed height of every MatchCard
const CARD_W  = 122; // px — fixed width  of every MatchCard
const SLOT_H  = CARD_H + 8; // vertical pitch between R32 cards (72 px)
const HALF_GAP = 28; // extra gap between bracket halves in R32
const COL_GAP  = 8;  // horizontal gap between columns

// Total container height: 8 slots + gap + 8 slots
const TOTAL_H = 8 * SLOT_H + HALF_GAP + 8 * SLOT_H;

/**
 * Compute the top-position (and center) of every match in the bracket.
 *
 * R32: positions are fixed, evenly-spaced with a half-separator after match 7.
 * R16 … Final: each match is vertically centered between its two children.
 */
function computePositions(): Map<number, { top: number; center: number }> {
  const pos = new Map<number, { top: number; center: number }>();

  // R32 — fixed positions
  const r32Order = BRACKET_ROUNDS[0].matches.map((m) => m.matchNumber);
  for (let i = 0; i < r32Order.length; i++) {
    const top =
      i < 8
        ? i * SLOT_H
        : 8 * SLOT_H + HALF_GAP + (i - 8) * SLOT_H;
    pos.set(r32Order[i], { top, center: top + CARD_H / 2 });
  }

  // R16 → Final — derive from children
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

// ─── MatchCard ────────────────────────────────────────────────────────────────
interface MatchCardProps {
  match: Match | undefined;
  matchNumber: number;
  roundIndex: number;
  teamMap: Map<number, Team> | undefined;
}

function MatchCard({ match, matchNumber, roundIndex, teamMap }: MatchCardProps) {
  const homeTeam = match ? getTeam(teamMap, match.homeTeamId) : TBD_TEAM;
  const awayTeam = match ? getTeam(teamMap, match.awayTeamId) : TBD_TEAM;

  const homeTbd = isTbd(homeTeam);
  const awayTbd = isTbd(awayTeam);

  const isLive     = match?.status === 'live';
  const isFinished = match?.status === 'finished';
  const showScore  = (isLive || isFinished) && match?.homeScore != null;

  const homeLabel = homeTbd ? slotLabel(matchNumber, 'home', roundIndex) : homeTeam.code;
  const awayLabel = awayTbd ? slotLabel(matchNumber, 'away', roundIndex) : awayTeam.code;

  const homeWon = isFinished && match!.homeScore! > match!.awayScore!;
  const awayWon = isFinished && match!.awayScore! > match!.homeScore!;

  const row = (
    tbd: boolean,
    label: string,
    team: Team,
    won: boolean,
    score: number | null | undefined,
    border: boolean,
  ) => (
    <div
      className={cn(
        'flex items-center gap-1 px-2 flex-1 min-w-0',
        border && 'border-b border-border',
        won && 'bg-accent/5',
      )}
    >
      {tbd ? (
        <span className="text-[8px] leading-tight text-muted flex-1 truncate">{label}</span>
      ) : (
        <>
          <TeamFlag code={team.code} emoji={team.flag} size={16} />
          <span
            className={cn(
              'flex-1 text-[10px] font-semibold truncate leading-tight',
              won ? 'text-text' : 'text-muted',
            )}
          >
            {team.name.length > 9 ? team.code : team.name}
          </span>
        </>
      )}
      {showScore && score != null && (
        <span
          className={cn(
            'text-[11px] font-bold tabular-nums ml-0.5 flex-shrink-0',
            isLive ? 'text-red-400' : won ? 'text-accent' : 'text-muted',
          )}
        >
          {score}
        </span>
      )}
    </div>
  );

  const card = (
    <div
      className={cn(
        'rounded-lg border bg-card border-border flex flex-col overflow-hidden flex-shrink-0',
        isLive && 'border-red-500/50',
      )}
      style={{ width: CARD_W, height: CARD_H }}
    >
      {row(homeTbd, homeLabel, homeTeam, homeWon, match?.homeScore, true)}
      {row(awayTbd, awayLabel, awayTeam, awayWon, match?.awayScore, false)}
    </div>
  );

  if (!match) return card;
  return <Link to={`/matches/${match.id}`}>{card}</Link>;
}

// ─── BracketView ──────────────────────────────────────────────────────────────
export function BracketView({ matches, teamMap }: Props) {
  const matchByNum = useMemo(
    () => new Map(matches.map((m) => [m.matchNumber, m])),
    [matches],
  );

  const positions = useMemo(() => computePositions(), []);

  const rounds = [
    { label: 'R32',      matchNums: BRACKET_ROUNDS[0].matches.map((m) => m.matchNumber), ri: 0 },
    { label: 'Octavos',  matchNums: BRACKET_ROUNDS[1].matches.map((m) => m.matchNumber), ri: 1 },
    { label: 'Cuartos',  matchNums: BRACKET_ROUNDS[2].matches.map((m) => m.matchNumber), ri: 2 },
    { label: 'Semis',    matchNums: BRACKET_ROUNDS[3].matches.map((m) => m.matchNumber), ri: 3 },
    { label: 'Final',    matchNums: BRACKET_ROUNDS[4].matches.map((m) => m.matchNumber), ri: 4 },
  ];

  const thirdMatch = matchByNum.get(THIRD_PLACE_MATCH.matchNumber);

  return (
    <div className="pb-6">
      {/* Horizontally scrollable bracket */}
      <div className="overflow-x-auto pb-3">
        <div
          className="flex items-start"
          style={{ gap: COL_GAP, padding: '0 4px 8px', minWidth: 'max-content' }}
        >
          {rounds.map(({ label, matchNums, ri }) => (
            <div key={ri} className="flex flex-col flex-shrink-0">
              {/* Round label */}
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider text-center mb-2 h-3">
                {label}
              </p>
              {/* Column — fixed height, each card absolutely positioned */}
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
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Third-place match */}
      <div className="mt-2 px-1">
        <p className="text-[9px] font-bold text-muted uppercase tracking-wider mb-2">3er Puesto</p>
        <MatchCard
          match={thirdMatch}
          matchNumber={THIRD_PLACE_MATCH.matchNumber}
          roundIndex={5}
          teamMap={teamMap}
        />
      </div>

      {/* Legend */}
      <div className="mt-3 px-1 flex items-center gap-4 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-accent/40 border border-accent/60" />
          Ganador
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-500/60" />
          En vivo
        </span>
      </div>
    </div>
  );
}
