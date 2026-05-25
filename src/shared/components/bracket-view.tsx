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

/** Label to show when a team slot is not yet determined */
function slotLabel(
  matchNumber: number,
  side: 'home' | 'away',
  roundIndex: number,
): string {
  if (roundIndex === 0) {
    // R32: use the fixed bracket label
    return R32_LABELS[matchNumber]?.[side] ?? 'Por definir';
  }
  return 'Por definir';
}

interface MatchCardProps {
  match: Match | undefined;
  matchNumber: number;
  roundIndex: number;
  teamMap: Map<number, Team> | undefined;
  compact?: boolean;
}

function MatchCard({ match, matchNumber, roundIndex, teamMap, compact = false }: MatchCardProps) {
  const homeTeam = match ? getTeam(teamMap, match.homeTeamId) : TBD_TEAM;
  const awayTeam = match ? getTeam(teamMap, match.awayTeamId) : TBD_TEAM;

  const homeTbd = isTbd(homeTeam);
  const awayTbd = isTbd(awayTeam);

  const isLive     = match?.status === 'live';
  const isFinished = match?.status === 'finished';
  const showScore  = (isLive || isFinished) && match?.homeScore != null;

  const homeLabel = homeTbd ? slotLabel(matchNumber, 'home', roundIndex) : homeTeam.code;
  const awayLabel = awayTbd ? slotLabel(matchNumber, 'away', roundIndex) : awayTeam.code;

  const content = (
    <div className={cn(
      'rounded-lg border bg-card border-border flex flex-col overflow-hidden',
      isLive && 'border-red-500/40',
      compact ? 'w-28' : 'w-32',
    )}>
      {/* Home row */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 border-b border-border',
        isFinished && match.homeScore! > match.awayScore! && 'bg-accent/5',
      )}>
        {homeTbd ? (
          <span className="text-[9px] text-muted flex-1 leading-tight">{homeLabel}</span>
        ) : (
          <>
            <TeamFlag code={homeTeam.code} emoji={homeTeam.flag} size={16} />
            <span className={cn(
              'flex-1 text-[10px] font-semibold truncate',
              isFinished && match.homeScore! > match.awayScore! ? 'text-text' : 'text-muted',
            )}>
              {homeTeam.name.length > 10 ? homeTeam.code : homeTeam.name}
            </span>
          </>
        )}
        {showScore && (
          <span className={cn(
            'text-[11px] font-bold font-display tabular-nums ml-1',
            isLive ? 'text-red-400' : isFinished && match.homeScore! > match.awayScore! ? 'text-accent' : 'text-muted',
          )}>
            {match.homeScore}
          </span>
        )}
      </div>

      {/* Away row */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1.5',
        isFinished && match.awayScore! > match.homeScore! && 'bg-accent/5',
      )}>
        {awayTbd ? (
          <span className="text-[9px] text-muted flex-1 leading-tight">{awayLabel}</span>
        ) : (
          <>
            <TeamFlag code={awayTeam.code} emoji={awayTeam.flag} size={16} />
            <span className={cn(
              'flex-1 text-[10px] font-semibold truncate',
              isFinished && match.awayScore! > match.homeScore! ? 'text-text' : 'text-muted',
            )}>
              {awayTeam.name.length > 10 ? awayTeam.code : awayTeam.name}
            </span>
          </>
        )}
        {showScore && (
          <span className={cn(
            'text-[11px] font-bold font-display tabular-nums ml-1',
            isLive ? 'text-red-400' : isFinished && match.awayScore! > match.homeScore! ? 'text-accent' : 'text-muted',
          )}>
            {match.awayScore}
          </span>
        )}
      </div>
    </div>
  );

  if (!match) return content;
  return <Link to={`/matches/${match.id}`}>{content}</Link>;
}



export function BracketView({ matches, teamMap }: Props) {
  const matchByNum = useMemo(
    () => new Map(matches.map((m) => [m.matchNumber, m])),
    [matches],
  );

  const slotHeight = 72;
  const totalSlots = 16;
  const colHeight  = totalSlots * slotHeight;

  // Helper: spacing for a given number of matches
  function colSpacing(numMatches: number) {
    return (colHeight - numMatches * slotHeight) / (numMatches + 1);
  }

  // Render a single column with equal vertical spacing
  function renderColumn(
    roundIndex: number,
    roundLabel: string,
    matchNums: number[],
    numMatches: number,
  ) {
    const spacing = colSpacing(numMatches);

    return (
      <div key={roundIndex} className="flex flex-col flex-shrink-0">
        <div className="text-[10px] font-bold text-muted uppercase tracking-wider text-center mb-3 h-4">
          {roundLabel}
        </div>
        <div style={{ height: colHeight }} className="relative">
          {matchNums.map((mn, i) => {
            const match = matchByNum.get(mn);
            // Calculate vertical position
            const slotCenter = spacing + i * (slotHeight + spacing) + slotHeight / 2;
            const top = slotCenter - slotHeight / 2;

            // Half separator: extra gap after 8th match in R32
            const extraOffset = roundIndex === 0 && i >= 8 ? spacing : 0;

            return (
              <div
                key={mn}
                className="absolute left-0 right-0"
                style={{ top: top + extraOffset }}
              >
                <MatchCard
                  match={match}
                  matchNumber={mn}
                  roundIndex={roundIndex}
                  teamMap={teamMap}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const r32Nums = BRACKET_ROUNDS[0].matches.map((m) => m.matchNumber);
  const r16Nums = BRACKET_ROUNDS[1].matches.map((m) => m.matchNumber);
  const qfNums  = BRACKET_ROUNDS[2].matches.map((m) => m.matchNumber);
  const sfNums  = BRACKET_ROUNDS[3].matches.map((m) => m.matchNumber);
  const finalNum = BRACKET_ROUNDS[4].matches.map((m) => m.matchNumber);
  const thirdMatch = matchByNum.get(THIRD_PLACE_MATCH.matchNumber);

  // Gap between columns
  const GAP = 8;

  return (
    <div className="pb-8">
      {/* Horizontally scrollable bracket */}
      <div className="overflow-x-auto pb-4">
        <div
          className="flex items-start"
          style={{ gap: GAP, paddingBottom: 8, minWidth: 'max-content', paddingLeft: 4, paddingRight: 4 }}
        >
          {renderColumn(0, 'Ronda de 32', r32Nums, 16)}
          {renderColumn(1, 'Octavos', r16Nums, 8)}
          {renderColumn(2, 'Cuartos', qfNums, 4)}
          {renderColumn(3, 'Semis', sfNums, 2)}
          {renderColumn(4, 'Final', finalNum, 1)}
        </div>
      </div>

      {/* Third place match */}
      <div className="mt-4 px-1">
        <p className="text-xs-s font-bold text-muted uppercase tracking-wider mb-2">
          3er Puesto
        </p>
        <div className="inline-block">
          <MatchCard
            match={thirdMatch}
            matchNumber={THIRD_PLACE_MATCH.matchNumber}
            roundIndex={5}
            teamMap={teamMap}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 px-1 flex items-center gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-accent/30 border border-accent/50" />
          Ganador
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500/30 border border-red-500/50" />
          En vivo
        </span>
      </div>
    </div>
  );
}
