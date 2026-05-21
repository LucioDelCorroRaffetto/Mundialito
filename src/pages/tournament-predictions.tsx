import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, CheckCircle2, Search, X, Trophy, Users } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import {
  useTournamentPrediction,
  useUpsertTournamentPrediction,
} from '@/shared/hooks/use-tournament-predictions';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import type { Player, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';

interface LocalPicks {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
}

interface PickCardProps {
  title: string;
  points: number;
  selectedTeamId: number | null;
  onSelect: (id: number) => void;
  sectionId: string;
  openSection: string | null;
  setOpenSection: (id: string | null) => void;
  teams: Team[];
}

function PickCard({
  title,
  points,
  selectedTeamId,
  onSelect,
  sectionId,
  openSection,
  setOpenSection,
  teams,
}: PickCardProps) {
  const team = teams.find((t) => t.id === selectedTeamId);
  const isOpen = openSection === sectionId;

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base-s font-bold text-text">{title}</p>
          <p className="text-xs-s text-accent font-semibold">+{points} pts</p>
        </div>
        {team ? (
          <div className="flex items-center gap-2">
            <TeamFlag code={team.code} emoji={team.flag} size={32} />
            <span className="text-sm-s font-semibold text-text">{team.name}</span>
            <button
              onClick={() => setOpenSection(isOpen ? null : sectionId)}
              className="text-xs-s text-muted underline ml-2"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenSection(isOpen ? null : sectionId)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
          >
            Elegir
          </button>
        )}
      </div>
      {isOpen && (
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelect(t.id);
                setOpenSection(null);
              }}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs-s',
                selectedTeamId === t.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-elevated'
              )}
            >
              <TeamFlag code={t.code} emoji={t.flag} size={32} />
              <span className="text-muted font-semibold">{t.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TopScorerCardProps {
  sectionId: string;
  openSection: string | null;
  setOpenSection: (id: string | null) => void;
  selectedPlayerId: number | null;
  onSelect: (id: number) => void;
  players: Player[];
  teams: Team[];
}

function TopScorerCard({
  sectionId,
  openSection,
  setOpenSection,
  selectedPlayerId,
  onSelect,
  players,
  teams,
}: TopScorerCardProps) {
  const isOpen = openSection === sectionId;
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const teamMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const team = teamMap.get(p.teamId);
      return (
        p.name.toLowerCase().includes(q) ||
        (team?.name.toLowerCase().includes(q) ?? false) ||
        (team?.code.toLowerCase().includes(q) ?? false)
      );
    });
  }, [players, query, teamMap]);

  // Group filtered players by team
  const grouped = useMemo(() => {
    const map = new Map<number, { team: Team; players: Player[] }>();
    for (const p of filtered) {
      const team = teamMap.get(p.teamId);
      if (!team) continue;
      if (!map.has(team.id)) map.set(team.id, { team, players: [] });
      map.get(team.id)!.players.push(p);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.team.name.localeCompare(b.team.name),
    );
  }, [filtered, teamMap]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const selectedTeam = selectedPlayer ? teamMap.get(selectedPlayer.teamId) : undefined;

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base-s font-bold text-text">Goleador del torneo</p>
          <p className="text-xs-s text-accent font-semibold">+15 pts</p>
        </div>
        {selectedPlayer ? (
          <div className="flex items-center gap-2">
            {selectedTeam && <TeamFlag code={selectedTeam.code} emoji={selectedTeam.flag} size={24} />}
            <div className="flex flex-col items-end">
              <span className="text-sm-s font-semibold text-text leading-tight">
                {selectedPlayer.name}
              </span>
              {selectedTeam && (
                <span className="text-xs-s text-muted">{selectedTeam.code}</span>
              )}
            </div>
            <button
              onClick={() => setOpenSection(isOpen ? null : sectionId)}
              className="text-xs-s text-muted underline ml-1"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenSection(isOpen ? null : sectionId)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
          >
            Elegir
          </button>
        )}
      </div>

      {isOpen && (
        <div className="pt-2 border-t border-border flex flex-col gap-2">
          {/* Search box */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jugador o selección..."
              className="w-full pl-8 pr-8 py-2 rounded-lg bg-elevated border border-border text-sm-s text-text placeholder:text-muted outline-none focus:border-accent"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
                aria-label="Limpiar búsqueda"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Results */}
          {players.length === 0 ? (
            <p className="text-xs-s text-muted text-center py-3">
              Cargando jugadores...
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-xs-s text-muted text-center py-3">
              No se encontraron jugadores
            </p>
          ) : (
            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
              {grouped.map(({ team, players: teamPlayers }) => (
                <div key={team.id}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TeamFlag code={team.code} emoji={team.flag} size={20} />
                    <span className="text-xs-s font-bold text-muted uppercase tracking-wide">
                      {team.name}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {teamPlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onSelect(p.id);
                          setOpenSection(null);
                        }}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-lg border text-left',
                          selectedPlayerId === p.id
                            ? 'border-accent bg-accent-soft'
                            : 'border-border bg-elevated',
                        )}
                      >
                        <span className="text-sm-s text-text font-medium">
                          {p.name}
                        </span>
                        <span className="text-xs-s text-muted">{p.position}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TournamentPredictionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // leagueId can come from URL param OR be chosen inline
  const leagueIdParam = searchParams.get('leagueId');

  const { data: myLeaguesData, isLoading: leaguesLoading } = useMyLeagues();
  const myLeagues = myLeaguesData?.data ?? [];

  // selectedLeagueId: URL param → first league → null
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(
    leagueIdParam ? Number(leagueIdParam) : null,
  );

  // Auto-select first league once leagues load (only if none pre-selected)
  useEffect(() => {
    if (!selectedLeagueId && myLeagues.length > 0) {
      setSelectedLeagueId(myLeagues[0].id);
    }
  }, [myLeagues, selectedLeagueId]);

  const [picks, setPicks] = useState<LocalPicks>({
    championTeamId: null,
    runnerUpTeamId: null,
    topScorerPlayerId: null,
    revelationTeamId: null,
    surpriseEliminatedTeamId: null,
  });
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const teams = teamsData ?? [];

  const { data: playersData } = usePlayers();
  const players = playersData ?? [];

  const tournamentQuery = useTournamentPrediction(selectedLeagueId ?? undefined);
  const upsertMutation = useUpsertTournamentPrediction();

  // Reset + repopulate picks when league changes
  useEffect(() => {
    setInitialised(false);
    setPicks({ championTeamId: null, runnerUpTeamId: null, topScorerPlayerId: null, revelationTeamId: null, surpriseEliminatedTeamId: null });
  }, [selectedLeagueId]);

  // Populate picks from server data once loaded
  useEffect(() => {
    if (tournamentQuery.data && !initialised) {
      const d = tournamentQuery.data;
      setPicks({
        championTeamId: d.championTeamId,
        runnerUpTeamId: d.runnerUpTeamId,
        topScorerPlayerId: d.topScorerPlayerId,
        revelationTeamId: d.revelationTeamId,
        surpriseEliminatedTeamId: d.surpriseEliminatedTeamId,
      });
      setInitialised(true);
    }
    if (!tournamentQuery.isLoading && !tournamentQuery.data && !initialised) {
      setInitialised(true);
    }
  }, [tournamentQuery.data, tournamentQuery.isLoading, initialised]);

  const handleSave = async () => {
    if (!selectedLeagueId) return;
    try {
      await upsertMutation.mutateAsync({
        leagueId: selectedLeagueId,
        championTeamId: picks.championTeamId,
        runnerUpTeamId: picks.runnerUpTeamId,
        topScorerPlayerId: picks.topScorerPlayerId,
        revelationTeamId: picks.revelationTeamId,
        surpriseEliminatedTeamId: picks.surpriseEliminatedTeamId,
      });
      toast.success('¡Pronósticos guardados!');
    } catch {
      toast.error('Error al guardar los pronósticos');
    }
  };

  const setField = (field: keyof LocalPicks) => (id: number) => {
    setPicks((prev) => ({ ...prev, [field]: id }));
  };

  const pageHeader = (
    <div className="flex items-center gap-3 px-4 pt-5 pb-3">
      <button
        onClick={() => navigate(-1)}
        className="p-2 rounded-md bg-elevated border border-border"
        aria-label="Volver"
      >
        <ArrowLeft size={18} className="text-text" />
      </button>
      <div>
        <h1 className="text-base-s font-bold text-text">Predicciones de Copa</h1>
        <p className="text-xs-s text-muted">Elegí campeón, goleador y más · se evalúan al final del torneo</p>
      </div>
    </div>
  );

  // Still loading leagues
  if (leaguesLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in pb-8">
        {pageHeader}
        <div className="px-4 mt-2"><SkeletonList count={5} /></div>
      </div>
    );
  }

  // User has no leagues → explain clearly and offer CTA
  if (!leaguesLoading && myLeagues.length === 0) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in pb-8">
        {pageHeader}
        <div className="mx-4 mt-6 p-6 rounded-xl bg-card border border-border flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
            <Trophy size={22} className="text-accent" />
          </div>
          <div>
            <p className="text-base-s font-bold text-text">Necesitás estar en una liga</p>
            <p className="text-sm-s text-muted mt-1">
              Los pronósticos de Copa son por liga. Unite o creá una para empezar.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <Link
              to="/leagues/create"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
            >
              <Users size={14} />
              Crear liga
            </Link>
            <Link
              to="/leagues/join"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-elevated border border-border text-text text-sm-s font-semibold"
            >
              Unirse
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = tournamentQuery.isLoading || teamsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in pb-8">
        {pageHeader}
        <div className="px-4 mt-2"><SkeletonList count={5} /></div>
      </div>
    );
  }

  const saving = upsertMutation.isPending;

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-8">
      {/* Header */}
      {pageHeader}

      {/* League picker — show when user is in multiple leagues */}
      {myLeagues.length > 1 && (
        <div className="px-4 pb-3">
          <p className="text-xs-s text-muted mb-2">Liga</p>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {myLeagues.map((league) => (
              <button
                key={league.id}
                onClick={() => setSelectedLeagueId(league.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs-s font-semibold whitespace-nowrap border transition-colors',
                  selectedLeagueId === league.id
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-card border-border text-muted hover:text-text',
                )}
              >
                {league.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Urgency badge */}
      <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-500/30">
        <Clock size={14} className="text-orange-400 flex-shrink-0" />
        <p className="text-xs-s text-orange-400 font-semibold">
          Solo podés cambiarlos hasta el 11 Jun
        </p>
      </div>

      {/* Pick cards */}
      <div className="flex flex-col gap-3 px-4">
        <PickCard
          title="Campeón"
          points={50}
          selectedTeamId={picks.championTeamId}
          onSelect={setField('championTeamId')}
          sectionId="champion"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Finalista"
          points={20}
          selectedTeamId={picks.runnerUpTeamId}
          onSelect={setField('runnerUpTeamId')}
          sectionId="runnerUp"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <TopScorerCard
          sectionId="topScorer"
          openSection={openSection}
          setOpenSection={setOpenSection}
          selectedPlayerId={picks.topScorerPlayerId}
          onSelect={(id) => setPicks((prev) => ({ ...prev, topScorerPlayerId: id }))}
          players={players}
          teams={teams}
        />
        <PickCard
          title="Revelación"
          points={10}
          selectedTeamId={picks.revelationTeamId}
          onSelect={setField('revelationTeamId')}
          sectionId="revelation"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Eliminado sorpresa"
          points={10}
          selectedTeamId={picks.surpriseEliminatedTeamId}
          onSelect={setField('surpriseEliminatedTeamId')}
          sectionId="eliminatedSurprise"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
      </div>

      {/* Scoring reference */}
      <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-2">Sistema de puntos</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['Campeón', '50 pts'],
            ['Finalista', '20 pts'],
            ['Goleador del torneo', '15 pts'],
            ['Revelación', '10 pts'],
            ['Eliminado sorpresa', '10 pts'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 mt-4">
        {upsertMutation.isSuccess ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500/15 border border-green-500/30"
          >
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-sm-s font-semibold text-green-400">
              ¡Pronósticos guardados!
            </span>
          </motion.div>
        ) : (
          <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
            Guardar pronósticos
          </Button>
        )}
      </div>
    </div>
  );
}
