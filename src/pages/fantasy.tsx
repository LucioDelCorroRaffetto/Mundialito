import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, Check, Clock, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import { useMyFantasyTeam, useUpdateFantasySquad } from '@/shared/hooks/use-fantasy';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { Player } from '@/shared/types/api';

const POSITIONS = ['Todo', 'GK', 'DEF', 'MID', 'FWD'] as const;
type PositionFilter = typeof POSITIONS[number];
type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

const POSITION_LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_SQUAD = 15;

const POSITION_LABELS: Record<Position, string> = {
  GK: 'Portero',
  DEF: 'Defensor',
  MID: 'Mediocampista',
  FWD: 'Delantero',
};

export function FantasyPage() {
  const [params, setParams] = useSearchParams();
  const leagueIdFromUrl = params.get('leagueId') ? Number(params.get('leagueId')) : undefined;
  const [localLeagueId, setLocalLeagueId] = useState<number | undefined>(leagueIdFromUrl);
  const leagueId = localLeagueId;

  const [selectedPosition, setSelectedPosition] = useState<PositionFilter>('Todo');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: playersData, isLoading: playersLoading } = usePlayers();
  const { data: fantasyData, isLoading: fantasyLoading } = useMyFantasyTeam(leagueId);
  const { data: leaguesResponse } = useMyLeagues();
  const updateSquad = useUpdateFantasySquad();

  const myLeagues = leaguesResponse?.data ?? [];

  const handleLeagueChange = (id: number) => {
    setLocalLeagueId(id);
    setParams({ leagueId: String(id) });
    // Reset squad selection so we reload for the new league
    setSelectedPlayerIds([]);
  };

  const teams = teamsData ?? [];
  const players = playersData ?? [];

  // Preload existing squad
  useEffect(() => {
    if (fantasyData?.squad && fantasyData.squad.length > 0) {
      setSelectedPlayerIds(fantasyData.squad.map((p) => p.id));
    }
  }, [fantasyData]);

  // Group players by teamId
  const playersByTeam = useMemo(() => {
    const map = new Map<number, Player[]>();
    for (const player of players) {
      const existing = map.get(player.teamId) ?? [];
      existing.push(player);
      map.set(player.teamId, existing);
    }
    return map;
  }, [players]);

  // Position counts for selected players
  const positionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const selectedSet = new Set(selectedPlayerIds);
    for (const player of players) {
      if (selectedSet.has(player.id)) {
        counts[player.position]++;
      }
    }
    return counts;
  }, [selectedPlayerIds, players]);

  const handleTogglePlayer = (player: Player) => {
    const isSelected = selectedPlayerIds.includes(player.id);

    if (isSelected) {
      setSelectedPlayerIds((prev) => prev.filter((id) => id !== player.id));
      return;
    }

    // Check total limit
    if (selectedPlayerIds.length >= MAX_SQUAD) {
      toast.error(`Ya tenés el máximo de ${MAX_SQUAD} jugadores`);
      return;
    }

    // Check position limit
    const limit = POSITION_LIMITS[player.position];
    if (positionCounts[player.position] >= limit) {
      toast.error(
        `Ya tenés ${limit} ${POSITION_LABELS[player.position]}${limit > 1 ? 's' : ''} (máximo)`
      );
      return;
    }

    setSelectedPlayerIds((prev) => [...prev, player.id]);
  };

  const handleSave = async () => {
    if (!leagueId) {
      toast.error('Seleccioná una liga arriba para guardar tu equipo');
      return;
    }
    if (selectedPlayerIds.length < 11) {
      toast.error(`Necesitás al menos 11 jugadores (tenés ${selectedPlayerIds.length})`);
      return;
    }
    try {
      await updateSquad.mutateAsync({ leagueId, playerIds: selectedPlayerIds });
      toast.success('¡Equipo guardado!');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err?.response?.data?.error?.message ?? 'Error al guardar el equipo');
    }
  };

  const isLoading = teamsLoading || playersLoading || (leagueId !== undefined && fantasyLoading);

  if (isLoading) {
    return (
      <div className="p-4">
        <SkeletonList count={6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Fantasy</h1>
        <p className="text-sm-s text-muted mt-1">
          Elegí entre 11 y {MAX_SQUAD} jugadores para tu equipo
        </p>
      </div>

      {/* Squads not ready banner */}
      <div className="mx-4 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm-s font-semibold text-amber-500">Plantillas aún no confirmadas</p>
          <p className="text-xs-s text-muted mt-0.5">
            Los equipos fantasy estarán disponibles a partir del <span className="font-semibold text-text">2 de junio</span>, cuando FIFA publique los planteles oficiales de los 48 países.
          </p>
        </div>
      </div>

      {/* League selector */}
      {myLeagues.length === 0 ? (
        <div className="mx-4 flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
          <Trophy size={18} className="text-muted flex-shrink-0" />
          <p className="text-sm-s text-muted">
            Necesitás estar en una liga para guardar tu equipo fantasy.
          </p>
        </div>
      ) : (
        <div className="mx-4 flex flex-col gap-1.5">
          <p className="text-xs-s font-semibold text-muted uppercase tracking-wide">Liga</p>
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {myLeagues.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLeagueChange(l.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm-s font-semibold transition-colors',
                  leagueId === l.id
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-card border-border text-text hover:border-accent-border'
                )}
              >
                {l.imageUrl ? (
                  <img src={l.imageUrl} alt={l.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                ) : (
                  <Trophy size={14} className={leagueId === l.id ? 'text-accent-on' : 'text-muted'} />
                )}
                {l.name}
              </button>
            ))}
          </div>
          {!leagueId && (
            <p className="text-xs-s text-orange-400 mt-0.5">
              Seleccioná una liga para poder guardar tu equipo
            </p>
          )}
        </div>
      )}

      {/* Position filter */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-1 no-scrollbar">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setSelectedPosition(pos)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs-s font-semibold whitespace-nowrap transition-colors',
              selectedPosition === pos
                ? 'bg-accent text-accent-on'
                : 'bg-card border border-border text-muted'
            )}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Squad counter */}
      <div className="mx-4 p-3 rounded-xl bg-card border border-border flex justify-between text-xs-s">
        {(Object.entries(POSITION_LIMITS) as [Position, number][]).map(([pos, max]) => (
          <div key={pos} className="flex flex-col items-center gap-0.5">
            <span className="text-muted">{pos}</span>
            <span
              className={cn(
                'font-bold',
                positionCounts[pos] >= max ? 'text-accent' : 'text-text'
              )}
            >
              {positionCounts[pos]}/{max}
            </span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-muted">Total</span>
          <span
            className={cn(
              'font-bold',
              selectedPlayerIds.length >= 11 ? 'text-accent' : 'text-text'
            )}
          >
            {selectedPlayerIds.length}/{MAX_SQUAD}
          </span>
        </div>
      </div>

      {/* Teams accordion */}
      <div className="flex flex-col gap-2 px-4">
        {teams.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border text-center">
            <p className="text-sm-s text-muted">
              Los equipos estarán disponibles próximamente
            </p>
          </div>
        ) : (
          teams.map((team) => {
            const teamPlayers = (playersByTeam.get(team.id) ?? []).filter(
              (p) => selectedPosition === 'Todo' || p.position === selectedPosition
            );

            // If filtering by position and team has no matching players, hide the team
            if (selectedPosition !== 'Todo' && teamPlayers.length === 0) return null;

            const selectedInTeam = teamPlayers.filter((p) =>
              selectedPlayerIds.includes(p.id)
            ).length;

            return (
              <div
                key={team.id}
                className="rounded-xl bg-card border border-border overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedTeam(expandedTeam === team.id ? null : team.id)
                  }
                  className="w-full flex items-center gap-3 p-4"
                >
                  <TeamFlag code={team.code} emoji={team.flag} size={32} />
                  <span className="flex-1 text-left text-sm-s font-semibold text-text">
                    {team.name}
                  </span>
                  {selectedInTeam > 0 && (
                    <span className="text-xs-s font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      {selectedInTeam}
                    </span>
                  )}
                  <span className="text-xs-s text-muted">{team.code}</span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'text-muted transition-transform',
                      expandedTeam === team.id && 'rotate-180'
                    )}
                  />
                </button>

                {expandedTeam === team.id && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="border-t border-border"
                  >
                    {teamPlayers.length === 0 ? (
                      <p className="px-4 py-3 text-xs-s text-muted italic">
                        No hay jugadores disponibles para este equipo.
                      </p>
                    ) : (
                      <ul>
                        {teamPlayers.map((player, idx) => {
                          const isSelected = selectedPlayerIds.includes(player.id);
                          const isLast = idx === teamPlayers.length - 1;
                          return (
                            <li key={player.id} className={cn(!isLast && 'border-b border-border')}>
                              <button
                                onClick={() => handleTogglePlayer(player)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                                  isSelected ? 'bg-accent/10' : 'hover:bg-muted/5'
                                )}
                              >
                                {/* Checkmark */}
                                <span
                                  className={cn(
                                    'flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
                                    isSelected
                                      ? 'bg-accent border-accent'
                                      : 'border-border'
                                  )}
                                >
                                  {isSelected && (
                                    <Check size={12} className="text-accent-on" strokeWidth={3} />
                                  )}
                                </span>

                                {/* Country flag */}
                                <TeamFlag
                                  code={team.code}
                                  emoji={team.flag}
                                  size={20}
                                  className="flex-shrink-0"
                                />

                                {/* Player info */}
                                <span className="flex-1 text-sm-s font-medium text-text">
                                  {player.name}
                                </span>

                                {/* Shirt number */}
                                {player.shirtNumber != null && (
                                  <span className="text-xs-s text-muted w-5 text-right">
                                    #{player.shirtNumber}
                                  </span>
                                )}

                                {/* Position badge */}
                                <span
                                  className={cn(
                                    'text-xs-s font-bold px-2 py-0.5 rounded-full',
                                    player.position === 'GK' && 'bg-yellow-500/20 text-yellow-600',
                                    player.position === 'DEF' && 'bg-blue-500/20 text-blue-500',
                                    player.position === 'MID' && 'bg-green-500/20 text-green-600',
                                    player.position === 'FWD' && 'bg-red-500/20 text-red-500'
                                  )}
                                >
                                  {player.position}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Save button */}
      {selectedPlayerIds.length > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="fixed bottom-20 left-4 right-4"
        >
          <button
            onClick={handleSave}
            disabled={updateSquad.isPending}
            className="w-full py-4 rounded-xl bg-accent text-accent-on font-bold text-base-s shadow-lg disabled:opacity-60"
          >
            {updateSquad.isPending
              ? 'Guardando...'
              : `Guardar equipo (${selectedPlayerIds.length})`}
          </button>
        </motion.div>
      )}
    </div>
  );
}
