import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Check, Trophy, LayoutList, Layers, Star, Crown, Shield, BarChart2, BookOpen, ChevronRight, Lock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import { useMyFantasyTeam, useUpdateFantasySquad, useFantasyStandings, useUserFantasyTeam } from '@/shared/hooks/use-fantasy';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { useAuthStore } from '@/shared/stores/auth-store';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import { play } from '@/shared/lib/sounds';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { useFantasyRounds, useFantasyLineup, useUpsertLineup } from '@/shared/hooks/use-fantasy-lineups';
import type { LineupPlayerInput } from '@/shared/hooks/use-fantasy-lineups';
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


interface PitchPlayer {
  id: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  shirtNumber: number | null;
}

// Shirt SVG — flat color with number
function Shirt({ color, textColor, number }: { color: string; textColor: string; number?: number | null }) {
  return (
    <svg viewBox="0 0 40 36" className="w-full h-full" fill="none">
      {/* Body */}
      <path d="M10 6 L4 14 L10 16 L10 34 L30 34 L30 16 L36 14 L30 6 L24 4 C23 8 17 8 16 4 Z" fill={color} />
      {/* Collar */}
      <ellipse cx="20" cy="5" rx="4" ry="2.5" fill={textColor} opacity="0.25" />
      {/* Number */}
      {number != null && (
        <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="bold" fill={textColor} fontFamily="sans-serif">
          {number}
        </text>
      )}
    </svg>
  );
}

const SHIRT_COLORS: Record<Position, { bg: string; text: string; ring: string }> = {
  GK:  { bg: '#f59e0b', text: '#1c1917', ring: 'ring-yellow-400' },
  DEF: { bg: '#3b82f6', text: '#ffffff', ring: 'ring-blue-400' },
  MID: { bg: '#22c55e', text: '#ffffff', ring: 'ring-green-400' },
  FWD: { bg: '#ef4444', text: '#ffffff', ring: 'ring-red-400' },
};

function PitchSlot({
  player,
  pos,
  onRemove,
  isStarter,
  isCaptain,
}: {
  player?: PitchPlayer;
  pos: Position;
  onRemove?: (id: number) => void;
  isStarter?: boolean;
  isCaptain?: boolean;
}) {
  const shirt = SHIRT_COLORS[pos];

  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1 w-[68px]">
        <div className="w-14 h-14 opacity-20 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
          <span className="text-[9px] text-white/40 font-bold">{pos}</span>
        </div>
        <span className="text-[8px] text-white/20 text-center leading-tight">{pos}</span>
      </div>
    );
  }

  const lastName = player.name.split(' ').slice(-1)[0] ?? player.name;
  const isBench = isStarter === false;

  return (
    <button
      onClick={() => onRemove?.(player.id)}
      className={cn('flex flex-col items-center gap-0.5 group w-[68px]', isBench && 'opacity-50')}
      title={`Quitar ${player.name}`}
    >
      {/* Photo-first design: big circular photo (or shirt fallback) so the
          user can actually recognise the player on the pitch. */}
      <div className={cn(
        'relative w-14 h-14 rounded-full overflow-hidden ring-2 transition-transform group-hover:scale-110 drop-shadow-lg',
        isCaptain ? 'ring-accent' : 'ring-white/40',
        isBench && 'grayscale',
      )} style={{ background: shirt.bg }}>
        {player.photoUrl ? (
          <img
            src={player.photoUrl}
            alt={player.name}
            className="absolute inset-0 w-full h-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Shirt color={shirt.bg} textColor={shirt.text} number={player.shirtNumber} />
          </div>
        )}
        {/* Shirt number badge — bottom right, semi-circle on the photo */}
        {player.photoUrl && player.shirtNumber != null && (
          <span
            className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full border-2 border-black/40 flex items-center justify-center text-[10px] font-black tabular-nums"
            style={{ background: shirt.bg, color: shirt.text }}
          >
            {player.shirtNumber}
          </span>
        )}
        {/* Captain crown — top left over the photo */}
        {isCaptain && (
          <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-md ring-2 ring-black/30">
            <Crown size={11} className="text-accent-on" />
          </span>
        )}
      </div>
      <span className="text-[10px] text-white font-bold truncate max-w-[68px] text-center leading-tight drop-shadow-md">
        {lastName}
      </span>
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
  // The pitch view used to grey out "bench" players based on the legacy
  // starter/captain flags. Now that the 11 + captain + vice are picked
  // per-round on the Titulares tab, this view is just the universe of
  // 15 — every player is rendered equally. The starter highlight lives
  // on the Titulares tab where it actually reflects the user's choice.
  const selectedSet = new Set(selectedPlayerIds);
  const selectedPlayers = players.filter((p) => selectedSet.has(p.id));

  const byPosition: Record<Position, PitchPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of selectedPlayers) {
    byPosition[p.position].push(p);
  }

  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden relative shadow-xl"
      style={{ background: 'linear-gradient(175deg, #1a5c35 0%, #2d8653 35%, #3aaa68 50%, #2d8653 65%, #1a5c35 100%)' }}
    >
      {/* Pitch markings — more detailed */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {/* Center line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/12" />
        {/* Center circle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/12" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/20" />
        {/* Top box */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-10 border-b border-x border-white/12 rounded-b-xl" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-4 border-b border-x border-white/12" />
        {/* Bottom box */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-10 border-t border-x border-white/12 rounded-t-xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-4 border-t border-x border-white/12" />
        {/* Grass stripes */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0"
            style={{
              top: `${i * (100 / 6)}%`,
              height: `${100 / 12}%`,
              background: 'rgba(0,0,0,0.04)',
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col gap-3 py-5 px-2">
        {PITCH_ROWS.map(({ pos, slots }) => {
          const posPlayers = byPosition[pos];
          const filledSlots = Array.from({ length: slots }, (_, i) => posPlayers[i]);
          return (
            <div key={pos} className="flex justify-around items-center px-1">
              {filledSlots.map((player, i) => (
                <PitchSlot
                  key={player?.id ?? `empty-${pos}-${i}`}
                  player={player}
                  pos={pos}
                  onRemove={onRemove}
                  // All squad members render identically here — starter /
                  // captain belong on the Titulares tab.
                  isStarter={undefined}
                  isCaptain={undefined}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom hint */}
      <p className="text-center text-[8px] text-white/25 pb-2 tracking-wide uppercase">
        Tocá para quitar
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
const STARTERS_COUNT = 11;

const POSITION_LABELS: Record<Position, string> = {
  GK: 'Portero',
  DEF: 'Defensor',
  MID: 'Mediocampista',
  FWD: 'Delantero',
};

type Tab = 'squad' | 'lineup' | 'standings' | 'guide';

export function FantasyPage() {
  const [tab, setTab] = useState<Tab>('squad');
  const [selectedPosition, setSelectedPosition] = useState<PositionFilter>('Todo');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [starterIds, setStarterIds] = useState<number[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'pitch'>('list');

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: playersData, isLoading: playersLoading } = usePlayers();
  const { data: fantasyData, isLoading: fantasyLoading } = useMyFantasyTeam();
  const { data: leaguesResponse } = useMyLeagues();
  const updateSquad = useUpdateFantasySquad();

  const myLeagues = leaguesResponse?.data ?? [];

  // Exclude internal placeholder teams (TBD for knockouts, PO1/PO2 for playoffs)
  const teams = (teamsData ?? []).filter(
    (t) => t.confederation !== null && t.code !== 'TBD' && t.code !== 'PO1' && t.code !== 'PO2',
  );
  const players = playersData ?? [];

  // Preload existing squad, starters and captain from server. We compute a
  // stable signature of the server squad and only sync local state when the
  // signature changes — otherwise every background refetch (TanStack Query
  // re-fires on focus, network reconnect, etc.) would silently wipe the
  // user's unsaved edits while they're still picking players.
  const serverSquadSignature = useMemo(() => {
    if (!fantasyData?.squad) return '';
    return fantasyData.squad
      .map((p) => `${p.id}:${p.isStarter ? 's' : 'b'}:${p.isCaptain ? 'c' : '-'}`)
      .sort()
      .join('|');
  }, [fantasyData?.squad]);
  const lastLoadedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fantasyData?.squad || fantasyData.squad.length === 0) return;
    if (lastLoadedSignatureRef.current === serverSquadSignature) return;
    lastLoadedSignatureRef.current = serverSquadSignature;
    setSelectedPlayerIds(fantasyData.squad.map((p) => p.id));
    setStarterIds(fantasyData.squad.filter((p) => p.isStarter).map((p) => p.id));
    const cap = fantasyData.squad.find((p) => p.isCaptain);
    setCaptainId(cap ? cap.id : null);
  }, [fantasyData?.squad, serverSquadSignature]);

  const playersById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  // Group players by teamId — sort each team's roster GK → DEF → MID → FWD,
  // then by shirt number within position so the picker matches how the
  // actual squad sheets are printed (GK 1, DEF 2-5, etc.). Players with
  // no shirt number sort last alphabetically.
  const playersByTeam = useMemo(() => {
    const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const map = new Map<number, Player[]>();
    for (const player of players) {
      const existing = map.get(player.teamId) ?? [];
      existing.push(player);
      map.set(player.teamId, existing);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const dp = (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99);
        if (dp !== 0) return dp;
        const sa = a.shirtNumber ?? 999;
        const sb = b.shirtNumber ?? 999;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
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

  // fantasy points lookup from saved squad
  const fantasyPointsById = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of fantasyData?.squad ?? []) map.set(p.id, p.fantasyPoints);
    return map;
  }, [fantasyData]);

  const totalPoints = fantasyData?.team?.totalPoints ?? 0;

  const handleTogglePlayer = (player: Player) => {
    const isSelected = selectedPlayerIds.includes(player.id);

    if (isSelected) {
      setSelectedPlayerIds((prev) => prev.filter((id) => id !== player.id));
      // also drop from starters / captain if present
      setStarterIds((prev) => prev.filter((id) => id !== player.id));
      setCaptainId((prev) => (prev === player.id ? null : prev));
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

  const handleRemoveFromPitch = (id: number) => {
    setSelectedPlayerIds((prev) => prev.filter((p) => p !== id));
    setStarterIds((prev) => prev.filter((p) => p !== id));
    setCaptainId((prev) => (prev === id ? null : prev));
  };

  // NOTE: starterIds / captainId / these handlers belong to the legacy
  // "fixed starters per tournament" model. They still feed the squad save
  // payload for backwards-compat but the user-facing toggling lives in
  // PerRoundLineupTab. We keep the helpers exported with underscore prefix
  // so the linter doesn't complain while preserving them as documentation.
  const _handleToggleStarter = (id: number) => {
    setStarterIds((prev) => {
      if (prev.includes(id)) {
        if (captainId === id) setCaptainId(null);
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= STARTERS_COUNT) {
        toast.error(`Solo podés tener ${STARTERS_COUNT} titulares`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const _handleSetCaptain = (id: number) => {
    if (!starterIds.includes(id)) {
      toast.error('El capitán tiene que ser titular');
      return;
    }
    setCaptainId((prev) => (prev === id ? null : id));
  };
  void _handleToggleStarter;
  void _handleSetCaptain;

  const handleSave = async () => {
    // The Plantel tab only chooses the universe of 15 — starters / captain
    // are picked per round in the Titulares tab now. We keep the legacy
    // payload happy by sending the first 11 as starters and the first one
    // as captain; the backend treats these as defaults that the per-round
    // lineup overrides. Without this, the save was blocked with 'marcá
    // 11 titulares' even though there's no UI to do that any more.
    if (selectedPlayerIds.length < 15) {
      toast.error(`Tenés que armar un plantel de 15 (tenés ${selectedPlayerIds.length})`);
      return;
    }
    const defaultStarters = selectedPlayerIds.slice(0, 11);
    const defaultCaptain = defaultStarters[0];
    try {
      await updateSquad.mutateAsync({
        playerIds: selectedPlayerIds,
        starterIds: defaultStarters,
        captainId: defaultCaptain,
      });
      toast.success('¡Equipo guardado! Elegí tu 11 inicial en la pestaña Titulares.');
      play('chime');
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

  const squadPlayers = selectedPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => p != null);

  return (
    <div className="flex flex-col gap-4 pb-36 md:pb-24 animate-fade-in">
      <div className="px-4 pt-6 pb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl-s font-display font-bold text-text">Fantasy</h1>
          <p className="text-sm-s text-muted mt-1">
            Armá tu plantel de 15. El 11 titular y capitán se eligen por fecha.
          </p>
        </div>
        {/* View toggle — only relevant on the squad tab */}
        {tab === 'squad' && (
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
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4">
        {([
          { id: 'squad', label: 'Plantel' },
          { id: 'lineup', label: 'Titulares' },
          { id: 'standings', label: 'Tabla' },
          { id: 'guide', label: 'Guía' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs-s font-semibold transition-colors',
              tab === t.id
                ? 'bg-accent text-accent-on'
                : 'bg-card border border-border text-muted hover:text-text'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Total points banner */}
      <div className="mx-4 flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/30">
        <Trophy size={18} className="text-accent flex-shrink-0" />
        <p className="text-sm-s text-text flex-1">Puntos de tu equipo</p>
        <span className="text-lg font-bold text-accent">{totalPoints}</span>
      </div>

      {tab === 'guide' && <FantasyGuide />}
      {tab === 'standings' && <FantasyStandings />}

      {tab === 'lineup' && (
        <PerRoundLineupTab squadPlayers={squadPlayers} />
      )}

      {tab === 'squad' && (
        <>
          {/* League info — global team counts for all leagues */}
          {myLeagues.length === 0 ? (
            <div className="mx-4 flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
              <Trophy size={18} className="text-muted flex-shrink-0" />
              <p className="text-sm-s text-muted">
                Tu equipo es global — no hace falta estar en una liga para guardarlo.
              </p>
            </div>
          ) : (
            // Quieter single-line note instead of the previous chip-list banner
            // (which collided with the team list and stole vertical space).
            <p className="mx-4 text-xs-s text-muted/70 flex items-center gap-1.5">
              <Trophy size={11} className="text-accent flex-shrink-0" />
              Tu equipo cuenta en {myLeagues.length === 1 ? 'tu liga' : `tus ${myLeagues.length} ligas`} automáticamente.
            </p>
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
              onRemove={handleRemoveFromPitch}
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
                              const pts = fantasyPointsById.get(player.id);
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

                                    {/* Fantasy points (if selected and has points) */}
                                    {isSelected && pts != null && (
                                      <span className="text-xs-s font-bold text-accent">
                                        {pts} pts
                                      </span>
                                    )}

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
        </>
      )}

      {/* Save button — only on squad & lineup tabs */}
      {/* Floating save for the squad. Hidden on the Titulares tab (which
          has its own per-round save) and only renders when the local pick
          differs from what's saved on the server. Without the dirty check
          the bar sat there permanently asking to save a no-op, even after
          a fresh load. */}
      {tab === 'squad' && (() => {
        const serverIds = fantasyData?.squad?.map((p) => p.id) ?? [];
        const serverSet = new Set(serverIds);
        const localSet = new Set(selectedPlayerIds);
        const isDirty =
          serverIds.length !== selectedPlayerIds.length ||
          serverIds.some((id) => !localSet.has(id)) ||
          selectedPlayerIds.some((id) => !serverSet.has(id));
        if (!isDirty || selectedPlayerIds.length === 0) return null;
        return (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            className="fixed bottom-20 md:bottom-6 left-0 md:left-56 xl:left-64 right-0 flex justify-center px-4 pointer-events-none z-30"
          >
            <button
              onClick={handleSave}
              disabled={updateSquad.isPending}
              className="pointer-events-auto w-full max-w-xl py-4 rounded-xl bg-accent text-accent-on font-bold text-base-s shadow-lg disabled:opacity-60 hover:opacity-90 transition-opacity"
            >
              {updateSquad.isPending
                ? 'Guardando...'
                : `Guardar plantel (${selectedPlayerIds.length}/15)`}
            </button>
          </motion.div>
        );
      })()}
    </div>
  );
}

// ─── Fantasy Guide ────────────────────────────────────────────────────────────

function GuideSection({
  emoji,
  title,
  children,
  defaultOpen = false,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <span className="flex-1 text-sm-s font-semibold text-text">{title}</span>
        <ChevronRight
          size={16}
          className={cn('text-muted transition-transform flex-shrink-0', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 flex flex-col gap-3 text-sm-s text-muted leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm-s text-muted">{label}</span>
      <span className={cn('text-sm-s font-bold', highlight ? 'text-accent' : value.startsWith('-') ? 'text-red-400' : 'text-green-400')}>
        {value}
      </span>
    </div>
  );
}


function FantasyGuide() {
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-center gap-2 py-1">
        <BookOpen size={16} className="text-accent" />
        <p className="text-sm-s font-bold text-text">¿Cómo funciona el Fantasy?</p>
      </div>

      {/* Intro */}
      <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
        <p className="text-sm-s text-text leading-relaxed">
          El Fantasy del Mundialito es un juego en el que armás tu <span className="font-semibold">equipo de 15 jugadores reales</span> del Mundial FIFA 2026.
          Cada vez que tus jugadores actúan en un partido, ganás puntos según su rendimiento.
          Gana el que acumule más puntos al final del torneo.
        </p>
      </div>

      <GuideSection emoji="📋" title="Paso 1 — Armá tu plantel (15 jugadores)" defaultOpen>
        <p>Tu plantel tiene que tener exactamente <span className="text-text font-semibold">15 jugadores</span> con esta distribución obligatoria:</p>
        <div className="rounded-lg bg-elevated border border-border overflow-hidden">
          {[
            { pos: 'GK', label: 'Porteros',         count: '2',  color: 'text-yellow-400' },
            { pos: 'DEF', label: 'Defensores',       count: '5',  color: 'text-blue-400'   },
            { pos: 'MID', label: 'Mediocampistas',   count: '5',  color: 'text-green-400'  },
            { pos: 'FWD', label: 'Delanteros',       count: '3',  color: 'text-red-400'    },
          ].map(({ pos, label, count, color }) => (
            <div key={pos} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0">
              <span className={cn('w-10 text-xs font-bold text-center px-1.5 py-0.5 rounded-full bg-elevated border border-border', color)}>{pos}</span>
              <span className="flex-1 text-sm-s text-text">{label}</span>
              <span className="text-sm-s font-bold text-text">{count}</span>
            </div>
          ))}
        </div>
        <p>En la pestaña <span className="text-text font-semibold">Plantel</span> expandís cada selección y tocás los jugadores para agregarlos. Podés ver el plantel en lista o en formato cancha.</p>
      </GuideSection>

      <GuideSection emoji="⭐" title="Paso 2 — Elegí tu 11 inicial por fecha">
        <p>De tus 15 jugadores, en cada <span className="text-text font-semibold">fecha del torneo</span> tenés que marcar <span className="text-text font-semibold">11 como titulares</span> y 4 quedan en el banco.</p>
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s font-semibold text-text mb-1">⚠️ Importante</p>
          <p className="text-xs-s">Solo los <span className="text-text font-semibold">titulares</span> de esa fecha suman puntos. Los suplentes no acumulan puntos por más goles que hagan.</p>
        </div>
        <p>Usá la pestaña <span className="text-text font-semibold">Titulares</span> para configurar el 11 inicial de cada fecha — podés cambiarlo entre rondas para apostar a los jugadores que tienen partido.</p>
      </GuideSection>

      <GuideSection emoji="👑" title="Paso 3 — Elegí tu capitán y vicecapitán">
        <p>Entre los 11 titulares, elegí <span className="text-text font-semibold">1 capitán</span> y <span className="text-text font-semibold">1 vicecapitán</span> por fecha:</p>
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
          <p className="text-sm-s font-bold text-accent text-center">Capitán suma DOBLE · Vicecapitán x1.5</p>
          <p className="text-xs-s text-muted text-center mt-0.5">Si tu capitán hace 6 pts vos recibís 12; tu vicecapitán los multiplica por 1.5.</p>
        </div>
        <p>Igual que el 11 inicial, el capitán y vice se eligen por fecha — apostá fuerte a quienes esperás que jueguen.</p>
      </GuideSection>

      <GuideSection emoji="📊" title="Sistema de puntuación por partido">
        <p>Cada vez que tus jugadores titulares juegan un partido del Mundial, suman o restan puntos según lo que hagan:</p>

        <div className="rounded-lg bg-elevated border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Puntos base</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Jugar el partido" value="+2 pts" />
            <ScoreRow label="No jugar" value="0 pts" />
          </div>

          <div className="px-3 py-2 border-b border-border border-t bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Goles (por posición)</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Gol de Portero" value="+6 pts" />
            <ScoreRow label="Gol de Defensor" value="+6 pts" />
            <ScoreRow label="Gol de Mediocampista" value="+5 pts" />
            <ScoreRow label="Gol de Delantero" value="+4 pts" />
          </div>

          <div className="px-3 py-2 border-b border-border border-t bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Otras acciones</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Asistencia (cualquier posición)" value="+3 pts" />
            <ScoreRow label="Valla invicta — Portero o Defensor" value="+4 pts" />
            <ScoreRow label="Valla invicta — Mediocampista" value="+1 pt" />
            <ScoreRow label="Tarjeta amarilla" value="-1 pt" />
            <ScoreRow label="Tarjeta roja" value="-3 pts" />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s font-semibold text-text mb-1">¿Qué es valla invicta?</p>
          <p className="text-xs-s">El equipo del jugador no recibió ningún gol en ese partido. Los porteros y defensores suman puntos extra por mantener el arco en cero.</p>
        </div>
      </GuideSection>

      <GuideSection emoji="🏆" title="¿Cómo se acumulan los puntos?">
        <p>Los puntos se acumulan <span className="text-text font-semibold">automáticamente</span> a lo largo del torneo a medida que se juegan los partidos. No necesitás hacer nada — el sistema actualiza los puntos de tus jugadores después de cada partido.</p>
        <div className="flex flex-col gap-2">
          {[
            { emoji: '⚽', text: 'Fase de grupos: 3 partidos por equipo (11 jun – 2 jul)' },
            { emoji: '🔥', text: 'Ronda de 32 y Octavos: eliminación directa, cada partido cuenta' },
            { emoji: '🏅', text: 'Cuartos, Semis y Final (26 jun – 19 jul): los mejores jugadores suman en las etapas decisivas' },
          ].map(({ emoji, text }) => (
            <div key={text} className="flex items-start gap-2">
              <span className="flex-shrink-0">{emoji}</span>
              <p className="text-xs-s">{text}</p>
            </div>
          ))}
        </div>
        <p>Los jugadores que llegan más lejos en el torneo tienen más partidos para sumar puntos. Vale la pena elegir jugadores de selecciones fuertes.</p>
      </GuideSection>

      <GuideSection emoji="💡" title="Tips para armar un buen equipo">
        <div className="flex flex-col gap-2.5">
          {[
            { tip: 'Capitán goleador', desc: 'Elegí de capitán al delantero o mediocampista de una selección que esperes que avance lejos en el torneo.' },
            { tip: 'Defensores de selecciones sólidas', desc: 'Una selección que llegue a semis puede sumar varias vallas invictas. 4 pts × varios partidos = mucho.' },
            { tip: 'Distribuí por selecciones', desc: 'Si todos tus jugadores son del mismo equipo y esa selección pierde en octavos, tus puntos se cortan ahí.' },
            { tip: 'El capitán tiene que jugar', desc: 'Si tu capitán no juega un partido, perdés el doble bonus. Revisá antes de cada fecha.' },
          ].map(({ tip, desc }) => (
            <div key={tip} className="p-3 rounded-lg bg-elevated border border-border">
              <p className="text-xs-s font-semibold text-text mb-0.5">✅ {tip}</p>
              <p className="text-xs-s text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection emoji="❓" title="Preguntas frecuentes">
        <div className="flex flex-col gap-3">
          {[
            {
              q: '¿Puedo cambiar mi equipo después de armarlo?',
              a: 'Sí, podés modificar tu plantel, titulares y capitán hasta que empiece el torneo (11 de junio). Una vez que arrancan los partidos, los cambios pueden quedar bloqueados.',
            },
            {
              q: '¿Qué pasa si un jugador de mi equipo no juega ningún partido?',
              a: 'Si un jugador no fue convocado o no juega, suma 0 puntos en esos partidos. Si es tu capitán, perdés el bonus doble en esos partidos.',
            },
            {
              q: '¿Hace falta estar en una liga para jugar al Fantasy?',
              a: 'No. Tu equipo es global y compite automáticamente en la tabla general. Si te unís a una liga, también compite dentro de esa liga.',
            },
            {
              q: '¿Cuándo se actualizan los puntos?',
              a: 'Los puntos se actualizan automáticamente después de cada partido, cuando el admin carga las estadísticas de los jugadores.',
            },
            {
              q: '¿Qué es la valla invicta (clean sheet)?',
              a: 'Un equipo tiene valla invicta cuando termina un partido sin recibir ningún gol. Solo aplica si el jugador jugó ese partido.',
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-xs-s font-semibold text-text mb-1">🙋 {q}</p>
              <p className="text-xs-s text-muted">{a}</p>
            </div>
          ))}
        </div>
      </GuideSection>
    </div>
  );
}

// ─── Lineup tab — pick 11 starters + captain ─────────────────────────────────

// ─── Per-round lineup tab (NEW) ──────────────────────────────────────────────

function PerRoundLineupTab({ squadPlayers }: { squadPlayers: Player[] }) {
  const { data: roundsData, isLoading: roundsLoading } = useFantasyRounds();
  const rounds = roundsData?.data ?? [];
  const currentRound = rounds.find((r) => r.isCurrent) ?? rounds.find((r) => r.isOpen) ?? null;
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  // Auto-select the current open round on load.
  useEffect(() => {
    if (selectedRound === null && currentRound) {
      setSelectedRound(currentRound.slug);
    }
  }, [currentRound, selectedRound]);

  const activeSlug = selectedRound ?? currentRound?.slug ?? null;
  const { data: lineupData, isLoading: lineupLoading } = useFantasyLineup(activeSlug);
  const upsertLineup = useUpsertLineup();

  // Local draft: playerIds with flags.
  const [draft, setDraft] = useState<LineupPlayerInput[]>([]);
  const [dirty, setDirty] = useState(false);

  // Stable key for the squad so the draft-init effect only re-fires when the
  // squad ACTUALLY changes (15 different player ids), not on every parent
  // re-render. Previously this was the root cause of "I unselect a player
  // and it pops back" — every parent render reset the draft to bench.
  const squadKey = useMemo(
    () => [...squadPlayers.map((p) => p.id)].sort((a, b) => a - b).join(','),
    [squadPlayers],
  );

  // Populate draft from server data when the round (or the squad itself)
  // changes. Local edits afterwards are preserved.
  //
  // The draft is ALWAYS built from the current 15-player squad, with the
  // server lineup overlayed on top. This is intentional: if the user saved
  // a lineup back when their squad was different (e.g. before adding a
  // player, or under an earlier bug that wrote partial rows), we still want
  // them to see all 15 current squad players — the missing ones simply
  // appear as bench. Otherwise the Titulares list would render only those
  // 9-10 stale rows and leave the user unable to even pick the new players.
  useEffect(() => {
    if (!activeSlug || squadPlayers.length === 0) return;
    const lineupByPlayer = new Map(
      (lineupData?.data ?? []).map((r) => [r.playerId, r]),
    );
    setDraft(
      squadPlayers.map((p) => {
        const saved = lineupByPlayer.get(p.id);
        return {
          playerId: p.id,
          isStarter: saved?.isStarter ?? false,
          isCaptain: saved?.isCaptain ?? false,
          isViceCaptain: saved?.isViceCaptain ?? false,
        };
      }),
    );
    setDirty(false);
    // squadKey (stable) deliberately replaces squadPlayers (unstable ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupData, activeSlug, squadKey]);

  const starterCount = draft.filter((p) => p.isStarter).length;
  const captainPicked = draft.some((p) => p.isCaptain);
  const vicePicked = draft.some((p) => p.isViceCaptain);
  const roundInfo = rounds.find((r) => r.slug === activeSlug);
  const isOpen = roundInfo?.isOpen ?? false;

  function toggle(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => {
      const cur = prev.find((p) => p.playerId === playerId);
      if (!cur) return prev;
      const willBeStarter = !cur.isStarter;
      const currentStarters = prev.filter((p) => p.isStarter).length;
      // Hard cap at 11 starters so the backend never rejects on count.
      if (willBeStarter && currentStarters >= 11) {
        toast.error('Solo podés tener 11 titulares — sacá uno antes de agregar otro');
        return prev;
      }
      // When de-starring a player, also strip captain/vice if they had it.
      return prev.map((p) =>
        p.playerId === playerId
          ? {
              ...p,
              isStarter: willBeStarter,
              isCaptain: willBeStarter ? p.isCaptain : false,
              isViceCaptain: willBeStarter ? p.isViceCaptain : false,
            }
          : p,
      );
    });
    setDirty(true);
  }

  function setCaptain(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => prev.map((p) => ({
      ...p,
      isCaptain: p.playerId === playerId,
      isViceCaptain: p.isViceCaptain && p.playerId !== playerId,
    })));
    setDirty(true);
  }

  function setVice(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => prev.map((p) => ({
      ...p,
      isViceCaptain: p.playerId === playerId,
      isCaptain: p.isCaptain && p.playerId !== playerId,
    })));
    setDirty(true);
  }

  async function handleSave() {
    if (!activeSlug) return;
    try {
      await upsertLineup.mutateAsync({ round: activeSlug, players: draft });
      toast.success('¡Lineup guardado!');
      play('chime');
      setDirty(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message ?? 'Error al guardar';
      toast.error(msg);
    }
  }

  const squadById = useMemo(() => new Map(squadPlayers.map((p) => [p.id, p])), [squadPlayers]);
  const ORDER = ['GK', 'DEF', 'MID', 'FWD'];
  // Both starters and bench are sorted by position then shirt number so the
  // list rhythm matches an actual team sheet (GK on top, FWDs at the bottom)
  // instead of insertion order from the squad.
  const sortByPositionThenShirt = (a: LineupPlayerInput, b: LineupPlayerInput) => {
    const pa = squadById.get(a.playerId);
    const pb = squadById.get(b.playerId);
    const dp = ORDER.indexOf(pa?.position ?? '') - ORDER.indexOf(pb?.position ?? '');
    if (dp !== 0) return dp;
    const sa = pa?.shirtNumber ?? 999;
    const sb = pb?.shirtNumber ?? 999;
    if (sa !== sb) return sa - sb;
    return (pa?.name ?? '').localeCompare(pb?.name ?? '');
  };
  const starters = draft.filter((p) => p.isStarter).sort(sortByPositionThenShirt);
  const bench = draft.filter((p) => !p.isStarter).sort(sortByPositionThenShirt);

  if (roundsLoading) return <div className="px-4 mt-4"><SkeletonList count={5} /></div>;
  if (squadPlayers.length < 15) {
    return (
      <div className="mx-4 mt-4 p-4 rounded-xl bg-card border border-border text-center flex flex-col items-center gap-3">
        <span className="text-2xl">🧩</span>
        <p className="text-sm-s font-semibold text-text">Primero armá tu plantel de 15</p>
        <p className="text-xs-s text-muted">Elegí 15 jugadores en la pestaña Plantel antes de configurar el lineup por fecha.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Round selector */}
      <div className="px-4">
        <p className="text-xs-s text-muted mb-2 font-semibold uppercase tracking-wider">Fecha</p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {rounds.map((r) => (
            <button
              key={r.slug}
              onClick={() => setSelectedRound(r.slug)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs-s font-semibold border transition-colors',
                activeSlug === r.slug ? 'bg-accent text-accent-on border-accent' : 'bg-elevated border-border text-muted',
                !r.isOpen && activeSlug !== r.slug && 'opacity-60',
              )}
            >
              {!r.isOpen && <Lock size={10} />}
              {r.label.replace('Grupos — ', '')}
              {r.isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>

      {/* Deadline info */}
      {roundInfo && (
        <div className={cn(
          'mx-4 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs-s',
          isOpen
            ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300'
            : 'bg-elevated border-border text-muted',
        )}>
          {isOpen ? <CheckCircle2 size={14} /> : <Lock size={14} />}
          {isOpen
            ? `Deadline: ${new Date(roundInfo.deadline).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}`
            : `Cerrado · ${lineupData?.meta.points ?? 0} pts en esta fecha`
          }
        </div>
      )}

      {lineupLoading ? (
        <div className="px-4"><SkeletonList count={11} /></div>
      ) : (
        <>
          {/* Starters */}
          <div className="px-4">
            <p className="text-xs-s text-muted mb-2 font-semibold uppercase tracking-wider">
              Titulares ({starterCount}/11)
              {!captainPicked && starterCount > 0 && isOpen && <span className="text-orange-400 ml-2">· Elegí capitán</span>}
              {!vicePicked && starterCount > 0 && isOpen && <span className="text-orange-400 ml-1">y vicecapitán</span>}
            </p>
            <div className="flex flex-col gap-1.5">
              {starters.map((row) => {
                const p = squadById.get(row.playerId);
                if (!p) return null;
                return (
                  <LineupRow
                    key={row.playerId}
                    player={p}
                    isStarter
                    isCaptain={row.isCaptain}
                    isViceCaptain={row.isViceCaptain}
                    isOpen={isOpen}
                    onToggle={() => toggle(row.playerId)}
                    onCaptain={() => setCaptain(row.playerId)}
                    onVice={() => setVice(row.playerId)}
                  />
                );
              })}
            </div>
          </div>

          {/* Bench */}
          <div className="px-4">
            <p className="text-xs-s text-muted mb-2 font-semibold uppercase tracking-wider">
              Suplentes ({bench.length})
            </p>
            <div className="flex flex-col gap-1.5 opacity-60">
              {bench.map((row) => {
                const p = squadById.get(row.playerId);
                if (!p) return null;
                return (
                  <LineupRow
                    key={row.playerId}
                    player={p}
                    isStarter={false}
                    isCaptain={false}
                    isViceCaptain={false}
                    isOpen={isOpen}
                    onToggle={() => toggle(row.playerId)}
                    onCaptain={undefined}
                    onVice={undefined}
                  />
                );
              })}
            </div>
          </div>

          {/* Save — sticky above the mobile tab bar (bottom-24 on mobile,
              regular on desktop). Only renders when there's actually
              something to do: either the user has unsaved changes OR the
              current draft is invalid (wrong starter count, missing
              captain, etc.). When everything matches the server, the
              button hides completely so it doesn't sit there asking to
              save a no-op. */}
          {(() => {
            if (!isOpen) return null;
            let blocker: string | null = null;
            if (starterCount < 11) blocker = `Faltan ${11 - starterCount} titular${11 - starterCount === 1 ? '' : 'es'}`;
            else if (starterCount > 11) blocker = `Sobran ${starterCount - 11} titular${starterCount - 11 === 1 ? '' : 'es'}`;
            else if (!captainPicked) blocker = 'Elegí un capitán (C)';
            else if (!vicePicked) blocker = 'Elegí un vicecapitán (V)';

            // Nothing pending → don't render anything at all. This is the
            // fix for 'el cartel aparece siempre aunque no haga cambios'.
            if (!dirty && blocker === null) return null;

            return (
              <div className="px-4 sticky z-10 bottom-24 md:bottom-4">
                <button
                  onClick={handleSave}
                  disabled={upsertLineup.isPending || blocker !== null}
                  className="w-full py-3 rounded-xl bg-accent text-accent-on font-semibold text-sm-s disabled:opacity-50 transition-opacity shadow-lg"
                >
                  {upsertLineup.isPending
                    ? 'Guardando…'
                    : blocker
                      ? blocker
                      : `Guardar lineup de ${roundInfo?.label ?? 'esta fecha'}`}
                </button>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function LineupRow({
  player,
  isStarter,
  isCaptain,
  isViceCaptain,
  isOpen,
  onToggle,
  onCaptain,
  onVice,
}: {
  player: Player;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onCaptain: (() => void) | undefined;
  onVice: (() => void) | undefined;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 p-2.5 rounded-xl border bg-card transition-colors',
      // Accent border + faint glow so a row reads as "starter" at a glance
      // even before checking the checkbox state. Captain/Vice get a stronger
      // ring on top of that.
      isStarter
        ? isCaptain
          ? 'border-yellow-400/60 ring-1 ring-yellow-400/30 bg-yellow-400/[0.04]'
          : isViceCaptain
            ? 'border-slate-300/60 ring-1 ring-slate-300/30'
            : 'border-accent/40'
        : 'border-border',
    )}>
      <button
        type="button"
        disabled={!isOpen}
        onClick={onToggle}
        aria-label={isStarter ? 'Quitar de titulares' : 'Marcar titular'}
        className={cn(
          'w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors',
          isStarter ? 'bg-accent border-accent text-accent-on' : 'bg-elevated border-border',
        )}
      >
        {isStarter && <Check size={13} strokeWidth={3} />}
      </button>
      {/* Player avatar — photo when available, position-coloured shirt as
          fallback. Same component the pitch view uses for visual consistency. */}
      <PlayerAvatar
        photoUrl={player.photoUrl ?? null}
        name={player.name}
        position={player.position}
      />
      <span
        className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
          POSITION_COLORS[player.position],
        )}
      >
        {player.position}
      </span>
      <span className="flex-1 text-sm-s font-semibold text-text truncate">{player.name}</span>
      {isStarter && onCaptain && (
        <button
          type="button"
          onClick={onCaptain}
          aria-label={isCaptain ? 'Capitán' : 'Marcar capitán'}
          className={cn(
            'w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 transition-all',
            isCaptain
              ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/40 scale-105'
              : 'bg-elevated border border-border text-muted hover:border-yellow-400/60',
          )}
          title="Capitán (x2 puntos)"
        >C</button>
      )}
      {isStarter && onVice && (
        <button
          type="button"
          onClick={onVice}
          aria-label={isViceCaptain ? 'Vicecapitán' : 'Marcar vicecapitán'}
          className={cn(
            'w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 transition-all',
            isViceCaptain
              ? 'bg-slate-300 text-black shadow-md shadow-slate-400/40 scale-105'
              : 'bg-elevated border border-border text-muted hover:border-slate-300/60',
          )}
          title="Vicecapitán (x1.5 puntos)"
        >V</button>
      )}
    </div>
  );
}

// ─── Old lineup tab (kept for now but no longer shown on per-round tab) ───────
// @ts-expect-error legacy component preserved as reference, no longer rendered

function LineupTab({
  squadPlayers,
  starterIds,
  captainId,
  fantasyPointsById,
  onToggleStarter,
  onSetCaptain,
}: {
  squadPlayers: Player[];
  starterIds: number[];
  captainId: number | null;
  fantasyPointsById: Map<number, number>;
  onToggleStarter: (id: number) => void;
  onSetCaptain: (id: number) => void;
}) {
  const starterSet = new Set(starterIds);

  if (squadPlayers.length === 0) {
    return (
      <div className="mx-4 p-6 rounded-xl bg-card border border-border text-center">
        <p className="text-sm-s text-muted">
          Primero armá tu plantel en la pestaña <span className="font-semibold text-text">Plantel</span>.
        </p>
      </div>
    );
  }

  const ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const byPosition = ORDER.map((pos) => ({
    pos,
    players: squadPlayers.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
        <p className="text-xs-s text-muted">
          Marcá <span className="font-semibold text-text">11 titulares</span> y elegí <span className="font-semibold text-text">1 capitán</span> (suma x2).
        </p>
        <span
          className={cn(
            'text-sm-s font-bold whitespace-nowrap',
            starterIds.length === STARTERS_COUNT ? 'text-accent' : 'text-text'
          )}
        >
          {starterIds.length}/{STARTERS_COUNT}
        </span>
      </div>

      {byPosition.map(({ pos, players }) => (
        <div key={pos} className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-elevated flex items-center gap-2">
            <span className={cn('text-xs-s font-bold px-2 py-0.5 rounded-full', POSITION_COLORS[pos])}>
              {pos}
            </span>
            <span className="text-xs-s text-muted">{POSITION_LABELS[pos]}</span>
          </div>
          <ul>
            {players.map((player, idx) => {
              const isStarter = starterSet.has(player.id);
              const isCaptain = captainId === player.id;
              const isLast = idx === players.length - 1;
              const pts = fantasyPointsById.get(player.id);
              return (
                <li key={player.id} className={cn('flex items-center gap-2 px-3 py-2.5', !isLast && 'border-b border-border')}>
                  {/* Starter toggle */}
                  <button
                    onClick={() => onToggleStarter(player.id)}
                    title={isStarter ? 'Pasar a suplentes' : 'Marcar como titular'}
                    className={cn(
                      'flex-shrink-0 px-2 py-1 rounded-md text-[10px] font-bold transition-colors border',
                      isStarter
                        ? 'bg-accent text-accent-on border-accent'
                        : 'bg-elevated text-muted border-border'
                    )}
                  >
                    {isStarter ? 'TITULAR' : 'SUPLENTE'}
                  </button>

                  <PlayerAvatar photoUrl={player.photoUrl} name={player.name} position={player.position} />

                  <span className={cn('flex-1 text-sm-s font-medium truncate', isStarter ? 'text-text' : 'text-muted')}>
                    {player.name}
                  </span>

                  {pts != null && (
                    <span className="text-xs-s font-bold text-accent">{pts}</span>
                  )}

                  {/* Captain toggle */}
                  <button
                    onClick={() => onSetCaptain(player.id)}
                    disabled={!isStarter}
                    title={isCaptain ? 'Quitar capitán' : 'Hacer capitán'}
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                      isCaptain
                        ? 'bg-accent text-accent-on'
                        : isStarter
                          ? 'bg-elevated text-muted hover:text-text'
                          : 'bg-elevated text-muted/30 cursor-not-allowed'
                    )}
                  >
                    {isCaptain ? <Crown size={14} /> : <Star size={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── User fantasy team drawer ────────────────────────────────────────────────

function UserTeamDrawer({
  userId,
  username,
  teamName,
  onClose,
}: {
  userId: number;
  username: string;
  teamName: string;
  onClose: () => void;
}) {
  // Bloquea el scroll del documento padre mientras el drawer está abierto.
  // Sin esto, en mobile el scroll dentro del drawer "se escapa" al body
  // (scroll chaining): el usuario empuja para bajar dentro de la lista de
  // suplentes, el body de la página se mueve, y al soltar parece que la
  // vista del drawer se "reinicia" cuando en realidad scrolleó el fondo.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const { data, isLoading } = useUserFantasyTeam(userId);
  const squad = data?.squad ?? [];

  const starters = squad.filter((p) => p.isStarter);
  const bench = squad.filter((p) => !p.isStarter);
  const captain = squad.find((p) => p.isCaptain);
  const viceCaptain = squad.find((p) => p.isViceCaptain);
  const totalPoints = data?.team?.totalPoints ?? 0;

  const ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const byPosition = ORDER.map((pos) => ({
    pos,
    players: starters.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg bg-card rounded-t-2xl border-t border-border max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 border-b border-border flex items-center gap-3 flex-shrink-0">
          <Trophy size={18} className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm-s font-bold text-text truncate">{teamName}</p>
            <p className="text-xs-s text-muted truncate">{username}</p>
          </div>
          <span className="text-lg font-bold text-accent">{totalPoints} pts</span>
        </div>

        {/* Body */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-4 pb-6">
          {isLoading ? (
            <div className="py-8"><SkeletonList count={5} /></div>
          ) : squad.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <Trophy size={32} className="text-muted opacity-30" />
              <p className="text-sm-s text-muted">Este usuario aún no armó su equipo</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pt-3">
              {/* Starters */}
              <div>
                <p className="text-xs-s font-bold text-muted uppercase tracking-wide mb-2">Titulares</p>
                <div className="rounded-xl bg-elevated border border-border overflow-hidden">
                  {byPosition.map(({ pos, players }) => (
                    <div key={pos}>
                      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center gap-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', POSITION_COLORS[pos])}>
                          {pos}
                        </span>
                      </div>
                      {players.map((p, idx) => {
                        const isCap = p.isCaptain;
                        const isVice = p.isViceCaptain;
                        const isLast = idx === players.length - 1;
                        return (
                          <div
                            key={p.id}
                            className={cn('flex items-center gap-3 px-3 py-2.5', !isLast && 'border-b border-border/50')}
                          >
                            <PlayerAvatar photoUrl={p.photoUrl} name={p.name} position={p.position} />
                            <span className="flex-1 text-sm-s font-medium text-text truncate">{p.name}</span>
                            {isCap && (
                              <span className="flex items-center gap-1 text-xs-s font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full flex-shrink-0">
                                <Crown size={10} /> CAP
                              </span>
                            )}
                            {isVice && (
                              <span className="flex items-center gap-1 text-xs-s font-bold text-slate-600 dark:text-slate-300 bg-slate-400/15 border border-slate-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                                <Shield size={10} /> VICE
                              </span>
                            )}
                            <span className="text-xs-s font-bold text-accent w-10 text-right flex-shrink-0">
                              {p.fantasyPoints} pts
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bench */}
              {bench.length > 0 && (
                <div>
                  <p className="text-xs-s font-bold text-muted uppercase tracking-wide mb-2">Suplentes</p>
                  <div className="rounded-xl bg-elevated border border-border overflow-hidden">
                    {bench.map((p, idx) => (
                      <div
                        key={p.id}
                        className={cn('flex items-center gap-3 px-3 py-2.5 opacity-50', idx < bench.length - 1 && 'border-b border-border/50')}
                      >
                        <PlayerAvatar photoUrl={p.photoUrl} name={p.name} position={p.position} />
                        <span className="flex-1 text-sm-s font-medium text-text truncate">{p.name}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', POSITION_COLORS[p.position])}>
                          {p.position}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {captain && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-3">
                  <Crown size={16} className="text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs-s text-muted">Capitán</p>
                    <p className="text-sm-s font-bold text-text truncate">{captain.name}</p>
                  </div>
                  <span className="text-xs-s font-bold text-accent">×2 pts</span>
                </div>
              )}

              {viceCaptain && (
                <div className="p-3 rounded-xl bg-slate-400/10 border border-slate-400/20 flex items-center gap-3">
                  <Shield size={16} className="text-slate-600 dark:text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs-s text-muted">Vicecapitán</p>
                    <p className="text-sm-s font-bold text-text truncate">{viceCaptain.name}</p>
                  </div>
                  <span className="text-xs-s font-bold text-slate-600 dark:text-slate-300">×1.5 pts</span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Fantasy standings tab ───────────────────────────────────────────────────

function FantasyStandings() {
  const { data, isLoading } = useFantasyStandings();
  const currentUser = useAuthStore((s) => s.user);
  const entries = data ?? [];
  const [viewingUser, setViewingUser] = useState<{ userId: number; username: string; teamName: string } | null>(null);

  if (isLoading) {
    return (
      <div className="px-4">
        <SkeletonList count={8} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-4 flex flex-col items-center py-16 gap-3">
        <BarChart2 size={40} className="text-muted opacity-40" />
        <p className="text-sm-s text-muted">Todavía no hay posiciones fantasy</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-4 rounded-xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-elevated">
          <span className="w-7 text-center text-xs-s text-muted">#</span>
          <span className="w-8 flex-shrink-0" />
          <span className="flex-1 text-xs-s text-muted">Equipo</span>
          <span className="text-xs-s text-muted">Pts</span>
        </div>
        {entries.map((entry) => {
          const isMe = entry.userId === currentUser?.id;
          const initials = entry.username.slice(0, 1).toUpperCase();
          return (
            <motion.button
              key={entry.userId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(entry.rank, 20) * 0.02 }}
              onClick={() => setViewingUser({ userId: entry.userId, username: entry.username, teamName: entry.teamName })}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left transition-colors hover:bg-elevated',
                isMe && 'bg-accent-soft hover:bg-accent-soft'
              )}
            >
              <span className={cn('w-7 text-center text-sm-s font-bold', isMe ? 'text-accent' : 'text-muted')}>
                {entry.rank}
              </span>
              <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                {entry.avatarUrl ? (
                  <img src={entry.avatarUrl} alt={entry.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm-s font-bold text-text">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm-s font-semibold truncate', isMe ? 'text-accent' : 'text-text')}>
                  {entry.teamName} {isMe && '(vos)'}
                </p>
                <p className="text-xs-s text-muted truncate">{entry.username}</p>
              </div>
              <span className={cn('text-base-s font-bold', isMe ? 'text-accent' : 'text-text')}>
                {entry.totalPoints}
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="text-center text-xs-s text-muted/50 mt-2">Tocá un equipo para ver su plantel</p>

      {viewingUser && (
        <UserTeamDrawer
          userId={viewingUser.userId}
          username={viewingUser.username}
          teamName={viewingUser.teamName}
          onClose={() => setViewingUser(null)}
        />
      )}
    </>
  );
}
