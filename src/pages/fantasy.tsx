import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Check, Clock, Trophy, LayoutList, Layers } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import { useMyFantasyTeam, useUpdateFantasySquad } from '@/shared/hooks/use-fantasy';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { Player } from '@/shared/types/api';

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-yellow-500/20 text-yellow-500',
  DEF: 'bg-blue-500/20 text-blue-400',
  MID: 'bg-green-500/20 text-green-500',
  FWD: 'bg-red-500/20 text-red-400',
};

function PlayerAvatar({ photoUrl, name, position }: { photoUrl: string | null; name: string; position: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0 bg-elevated"
        loading="lazy"
      />
    );
  }
  // Fallback: colored circle with initial
  return (
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold', POSITION_COLORS[position] ?? 'bg-elevated text-muted')}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Pitch view ────────────────────────────────────────────────────────────
const PITCH_ROWS: { pos: Position; slots: number }[] = [
  { pos: 'FWD', slots: 3 },
  { pos: 'MID', slots: 5 },
  { pos: 'DEF', slots: 5 },
  { pos: 'GK',  slots: 2 },
];

const PITCH_POS_COLORS: Record<Position, { ring: string; bg: string; text: string }> = {
  GK:  { ring: 'ring-yellow-400',  bg: 'bg-yellow-400/20',  text: 'text-yellow-300' },
  DEF: { ring: 'ring-blue-400',    bg: 'bg-blue-400/20',    text: 'text-blue-300' },
  MID: { ring: 'ring-green-400',   bg: 'bg-green-400/20',   text: 'text-green-300' },
  FWD: { ring: 'ring-red-400',     bg: 'bg-red-400/20',     text: 'text-red-300' },
};

interface PitchPlayer {
  id: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  shirtNumber: number | null;
}

function PitchSlot({ player, pos, onRemove }: { player?: PitchPlayer; pos: Position; onRemove?: (id: number) => void }) {
  const colors = PITCH_POS_COLORS[pos];
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={cn('w-10 h-10 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center')} >
          <span className="text-white/20 text-xs font-bold">{pos}</span>
        </div>
        <span className="text-[9px] text-white/20 truncate max-w-[48px] text-center">vacío</span>
      </div>
    );
  }
  const lastName = player.name.split(' ').pop() ?? player.name;
  return (
    <button
      onClick={() => onRemove?.(player.id)}
      className="flex flex-col items-center gap-1 group"
      title={`Quitar ${player.name}`}
    >
      <div className={cn('w-10 h-10 rounded-full ring-2 overflow-hidden flex-shrink-0', colors.ring, colors.bg)}>
        {player.photoUrl ? (
          <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
        ) : (
          <span className={cn('w-full h-full flex items-center justify-center text-sm font-bold', colors.text)}>
            {player.name.charAt(0)}
          </span>
        )}
      </div>
      <span className="text-[9px] text-white/80 font-semibold truncate max-w-[48px] text-center leading-tight group-hover:text-white transition-colors">
        {lastName}
      </span>
      {player.shirtNumber != null && (
        <span className="text-[8px] text-white/40">{player.shirtNumber}</span>
      )}
    </button>
  );
}

function PitchView({
  selectedPlayerIds,
  players,
  onRemove,
}: {
  selectedPlayerIds: number[];
  players: PitchPlayer[];
  onRemove: (id: number) => void;
}) {
  const selectedSet = new Set(selectedPlayerIds);
  const selectedPlayers = players.filter((p) => selectedSet.has(p.id));

  const byPosition: Record<Position, PitchPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of selectedPlayers) {
    byPosition[p.position].push(p);
  }

  return (
    <div className="mx-4 rounded-xl overflow-hidden relative" style={{ background: 'linear-gradient(180deg, #2d6a4f 0%, #40916c 25%, #52b788 50%, #40916c 75%, #2d6a4f 100%)' }}>
      {/* Pitch markings */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-px" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-8 border-b border-x border-white/10 rounded-b-lg" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-8 border-t border-x border-white/10 rounded-t-lg" />
      </div>

      <div className="relative flex flex-col gap-2 py-4 px-3">
        {PITCH_ROWS.map(({ pos, slots }) => {
          const posPlayers = byPosition[pos];
          const filledSlots = Array.from({ length: slots }, (_, i) => posPlayers[i]);
          return (
            <div key={pos} className="flex justify-around items-start px-2">
              {filledSlots.map((player, i) => (
                <PitchSlot
                  key={player?.id ?? `empty-${pos}-${i}`}
                  player={player}
                  pos={pos}
                  onRemove={onRemove}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[9px] text-white/30 pb-2">
        Tocá un jugador para quitarlo
      </p>
    </div>
  );
}

// ─── End pitch view ─────────────────────────────────────────────────────────

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
  const [selectedPosition, setSelectedPosition] = useState<PositionFilter>('Todo');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'pitch'>('list');

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: playersData, isLoading: playersLoading } = usePlayers();
  const { data: fantasyData, isLoading: fantasyLoading } = useMyFantasyTeam();
  const { data: leaguesResponse } = useMyLeagues();
  const updateSquad = useUpdateFantasySquad();

  const myLeagues = leaguesResponse?.data ?? [];

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
    if (selectedPlayerIds.length < 11) {
      toast.error(`Necesitás al menos 11 jugadores (tenés ${selectedPlayerIds.length})`);
      return;
    }
    try {
      await updateSquad.mutateAsync({ playerIds: selectedPlayerIds });
      toast.success('¡Equipo guardado!');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err?.response?.data?.error?.message ?? 'Error al guardar el equipo');
    }
  };

  const isLoading = teamsLoading || playersLoading || fantasyLoading;

  if (isLoading) {
    return (
      <div className="p-4">
        <SkeletonList count={6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24 animate-fade-in">
      <div className="px-4 pt-6 pb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl-s font-display font-bold text-text">Fantasy</h1>
          <p className="text-sm-s text-muted mt-1">
            Elegí entre 11 y {MAX_SQUAD} jugadores para tu equipo
          </p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 mt-1 p-0.5 rounded-lg bg-elevated border border-border flex-shrink-0">
          <button
            onClick={() => setViewMode('list')}
            title="Vista lista"
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'list' ? 'bg-accent text-accent-on' : 'text-muted hover:text-text'
            )}
          >
            <LayoutList size={16} />
          </button>
          <button
            onClick={() => setViewMode('pitch')}
            title="Vista cancha"
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'pitch' ? 'bg-accent text-accent-on' : 'text-muted hover:text-text'
            )}
          >
            <Layers size={16} />
          </button>
        </div>
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

      {/* League info — global team counts for all leagues */}
      {myLeagues.length === 0 ? (
        <div className="mx-4 flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
          <Trophy size={18} className="text-muted flex-shrink-0" />
          <p className="text-sm-s text-muted">
            Tu equipo es global — no hace falta estar en una liga para guardarlo.
          </p>
        </div>
      ) : (
        <div className="mx-4 flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
          <Trophy size={16} className="text-accent flex-shrink-0" />
          <p className="text-xs-s text-muted flex-1">
            Tu equipo cuenta para <span className="font-semibold text-text">todas tus ligas</span> automáticamente
          </p>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {myLeagues.map((l) => (
              <span key={l.id} className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-elevated border border-border text-xs-s text-text font-medium">
                {l.imageUrl ? (
                  <img src={l.imageUrl} alt={l.name} className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" />
                ) : (
                  <Trophy size={10} className="text-muted flex-shrink-0" />
                )}
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Position filter — list mode only */}
      {viewMode === 'list' && <div className="flex gap-2 px-4 overflow-x-auto pb-1 no-scrollbar">
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
      </div>}

      {/* Squad counter */}
      <div className={cn('mx-4 p-3 rounded-xl bg-card border border-border flex justify-between text-xs-s', viewMode === 'pitch' && 'hidden')}>
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

      {/* Pitch view */}
      {viewMode === 'pitch' && (
        <PitchView
          selectedPlayerIds={selectedPlayerIds}
          players={players as PitchPlayer[]}
          onRemove={(id) => setSelectedPlayerIds((prev) => prev.filter((p) => p !== id))}
        />
      )}

      {/* Teams accordion */}
      {viewMode === 'list' && <div className="flex flex-col gap-2 px-4">
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

                                {/* Player photo */}
                                <PlayerAvatar
                                  photoUrl={player.photoUrl}
                                  name={player.name}
                                  position={player.position}
                                />

                                {/* Player name */}
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
                                    POSITION_COLORS[player.position]
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
      </div>}

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
