import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, CheckCircle2, Search, X, Trophy, Users, Lock } from 'lucide-react';

// ─── Tournament-level lock ────────────────────────────────────────────────────
// Cierre extendido hasta el cierre de la fase de grupos (2026-06-19 18:55 UTC).
// Los pronósticos del torneo no afectan partidos individuales — el scoring se
// evalúa al final de la fase, así que aceptamos entradas hasta ese hito. Si se
// cambia este valor hay que reflejarlo también en upsert-tournament-prediction.ts.
const OPENING_LOCK_UTC = new Date('2026-06-19T18:55:00Z');
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import {
  useTournamentPrediction,
  useUpsertTournamentPrediction,
  useMyTournamentPredictions,
} from '@/shared/hooks/use-tournament-predictions';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import type { Player, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';

interface LocalPicks {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorerPlayerId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
  bestDefenseTeamId: number | null;
}

interface PickCardProps {
  title: string;
  subtitle?: string;
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
  subtitle,
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base-s font-bold text-text">{title}</p>
          {subtitle && <p className="text-xs-s text-muted mt-0.5">{subtitle}</p>}
          <p className="text-xs-s text-accent font-semibold mt-0.5">+{points} pts</p>
        </div>
        {team ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <TeamFlag code={team.code} emoji={team.flag} size={24} />
            <div className="flex flex-col items-end">
              <span className="text-sm-s font-semibold text-text leading-tight">{team.code}</span>
              <span className="text-[10px] text-muted leading-tight max-w-[80px] text-right truncate">{team.name}</span>
            </div>
            <button
              onClick={() => setOpenSection(isOpen ? null : sectionId)}
              className="text-xs-s text-accent underline whitespace-nowrap font-semibold"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenSection(isOpen ? null : sectionId)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
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

// Goleador unlock: 48/48 squads landed in the DB on June 1 (one day
// ahead of FIFA's official confirmation date). Flag now permanently
// resolved at module-load — kept as a constant for clarity.
const scorerLocked = false;

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

  if (scorerLocked) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base-s font-bold text-text">Goleador del torneo</p>
            <p className="text-xs-s text-accent font-semibold">+15 pts</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-border">
          <span className="text-lg">📋</span>
          <div>
            <p className="text-sm-s font-semibold text-text">Disponible el 2 de junio</p>
            <p className="text-xs-s text-muted">Esperando listas oficiales de todos los países</p>
          </div>
        </div>
      </div>
    );
  }

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
  // Personal leagues are hidden containers — don't surface them in the
  // league picker chips here either. Saves still propagate behind the scenes.
  const myLeagues = (myLeaguesData?.data ?? []).filter((l) => !l.isPersonal);

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
    thirdPlaceTeamId: null,
    topScorerPlayerId: null,
    revelationTeamId: null,
    surpriseEliminatedTeamId: null,
    bestDefenseTeamId: null,
  });
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  // Filter out internal placeholder teams (TBD for knockout slots, PO1/PO2 for intercontinental playoffs)
  const teams = (teamsData ?? []).filter(
    (t) => t.confederation !== null && t.code !== 'TBD' && t.code !== 'PO1' && t.code !== 'PO2',
  );

  const { data: playersData } = usePlayers();
  const players = playersData ?? [];

  const tournamentQuery = useTournamentPrediction(selectedLeagueId ?? undefined);
  const myTournamentPredictions = useMyTournamentPredictions();
  const upsertMutation = useUpsertTournamentPrediction();
  const hasAnyTournamentPrediction =
    (myTournamentPredictions.data?.meta.total ?? 0) > 0;

  // Reset + repopulate picks when league changes
  useEffect(() => {
    setInitialised(false);
    setPicks({
      championTeamId: null,
      runnerUpTeamId: null,
      thirdPlaceTeamId: null,
      topScorerPlayerId: null,
      revelationTeamId: null,
      surpriseEliminatedTeamId: null,
      bestDefenseTeamId: null,
    });
  }, [selectedLeagueId]);

  // Populate picks from server data once loaded
  useEffect(() => {
    if (tournamentQuery.data && !initialised) {
      const d = tournamentQuery.data;
      setPicks({
        championTeamId: d.championTeamId,
        runnerUpTeamId: d.runnerUpTeamId,
        thirdPlaceTeamId: d.thirdPlaceTeamId,
        topScorerPlayerId: d.topScorerPlayerId,
        revelationTeamId: d.revelationTeamId,
        surpriseEliminatedTeamId: d.surpriseEliminatedTeamId,
        bestDefenseTeamId: d.bestDefenseTeamId,
      });
      setInitialised(true);
    }
    if (!tournamentQuery.isLoading && !tournamentQuery.data && !initialised) {
      setInitialised(true);
    }
  }, [tournamentQuery.data, tournamentQuery.isLoading, initialised]);

  const handleSave = async () => {
    if (!selectedLeagueId) return;
    // First time saving across any league → propagate to all leagues (omit
    // leagueId). Once at least one prediction exists, scope the save to the
    // selected league so the user can override per league.
    const propagateToAllLeagues = !hasAnyTournamentPrediction;
    try {
      await upsertMutation.mutateAsync({
        ...(propagateToAllLeagues ? {} : { leagueId: selectedLeagueId }),
        championTeamId: picks.championTeamId,
        runnerUpTeamId: picks.runnerUpTeamId,
        thirdPlaceTeamId: picks.thirdPlaceTeamId,
        topScorerPlayerId: picks.topScorerPlayerId,
        revelationTeamId: picks.revelationTeamId,
        surpriseEliminatedTeamId: picks.surpriseEliminatedTeamId,
        bestDefenseTeamId: picks.bestDefenseTeamId,
      });
      toast.success(
        propagateToAllLeagues && myLeagues.length > 1
          ? '¡Pronósticos guardados en todas tus ligas!'
          : '¡Pronósticos guardados!',
      );
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

  // Lock status: computed once at render time from the hardcoded threshold.
  // The server enforces the same rule independently (reads predictionLockUtc
  // from the first match); this client-side flag is for UX only.
  const isTournamentLocked = new Date() >= OPENING_LOCK_UTC;

  const saving = upsertMutation.isPending;

  // Compare local picks vs server-saved picks to detect unsaved changes
  const savedPicks: LocalPicks = tournamentQuery.data
    ? {
        championTeamId: tournamentQuery.data.championTeamId,
        runnerUpTeamId: tournamentQuery.data.runnerUpTeamId,
        thirdPlaceTeamId: tournamentQuery.data.thirdPlaceTeamId,
        topScorerPlayerId: tournamentQuery.data.topScorerPlayerId,
        revelationTeamId: tournamentQuery.data.revelationTeamId,
        surpriseEliminatedTeamId: tournamentQuery.data.surpriseEliminatedTeamId,
        bestDefenseTeamId: tournamentQuery.data.bestDefenseTeamId,
      }
    : {
        championTeamId: null,
        runnerUpTeamId: null,
        thirdPlaceTeamId: null,
        topScorerPlayerId: null,
        revelationTeamId: null,
        surpriseEliminatedTeamId: null,
        bestDefenseTeamId: null,
      };

  const isDirty =
    picks.championTeamId !== savedPicks.championTeamId ||
    picks.runnerUpTeamId !== savedPicks.runnerUpTeamId ||
    picks.thirdPlaceTeamId !== savedPicks.thirdPlaceTeamId ||
    picks.topScorerPlayerId !== savedPicks.topScorerPlayerId ||
    picks.revelationTeamId !== savedPicks.revelationTeamId ||
    picks.surpriseEliminatedTeamId !== savedPicks.surpriseEliminatedTeamId ||
    picks.bestDefenseTeamId !== savedPicks.bestDefenseTeamId;

  // Show "saved" only when server has data AND user hasn't changed anything
  const showSaved = !isDirty && !!tournamentQuery.data && !saving;

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

      {/* Lock / urgency banner */}
      {isTournamentLocked ? (
        <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/15 border border-red-500/30">
          <Lock size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-xs-s text-red-400 font-semibold">
            El torneo ya comenzó — los pronósticos están cerrados
          </p>
        </div>
      ) : (
        <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-500/30">
          <Clock size={14} className="text-orange-400 flex-shrink-0" />
          <p className="text-xs-s text-orange-400 font-semibold">
            Solo podés cambiarlos hasta el 11 Jun, 15:55 (AR)
          </p>
        </div>
      )}

      {/* Pick cards */}
      <div className={cn('flex flex-col gap-3 px-4', isTournamentLocked && 'pointer-events-none opacity-60')}>
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
        <PickCard
          title="Tercer puesto"
          subtitle="Equipo que gana el partido por el bronce"
          points={12}
          selectedTeamId={picks.thirdPlaceTeamId}
          onSelect={setField('thirdPlaceTeamId')}
          sectionId="thirdPlace"
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
          title="Ceniciento del torneo"
          subtitle="Equipo modesto que llegará más lejos de lo esperado"
          points={10}
          selectedTeamId={picks.revelationTeamId}
          onSelect={setField('revelationTeamId')}
          sectionId="revelation"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Decepción del torneo"
          subtitle="Favorito o candidato que caerá antes de tiempo"
          points={10}
          selectedTeamId={picks.surpriseEliminatedTeamId}
          onSelect={setField('surpriseEliminatedTeamId')}
          sectionId="eliminatedSurprise"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Valla menos vencida"
          subtitle="Menor promedio de goles recibidos por partido. Tiene que haber jugado al menos octavos para clasificar."
          points={8}
          selectedTeamId={picks.bestDefenseTeamId}
          onSelect={setField('bestDefenseTeamId')}
          sectionId="bestDefense"
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
            ['Tercer puesto', '12 pts'],
            ['Goleador del torneo', '15 pts'],
            ['Ceniciento del torneo', '10 pts'],
            ['Decepción del torneo', '10 pts'],
            ['Valla menos vencida', '8 pts'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>

        {/* Plain-language explanation of how Valla Menos Vencida is judged.
            Without this users were rightly confused when a group-stage
            team had a better goals-conceded record than a finalist. */}
        <p className="text-xs-s text-muted mt-3 leading-relaxed">
          <span className="text-text font-semibold">Cómo se decide la valla menos vencida:</span>{' '}
          el equipo con <span className="text-text font-semibold">menor promedio de goles recibidos por partido</span>,
          contando todos los partidos jugados en el torneo. Para que cuente, el equipo
          tiene que haber clasificado <span className="text-text font-semibold">al menos a octavos</span> —
          así, los que quedan afuera en grupos no ganan por jugar menos partidos.
        </p>
      </div>

      {/* First-time hint */}
      {!hasAnyTournamentPrediction && myLeagues.length > 1 && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-accent-soft border border-accent-border flex items-start gap-2">
          <Trophy size={14} className="text-accent flex-shrink-0 mt-0.5" />
          <p className="text-xs-s text-text leading-snug">
            Es tu primera vez, así que al guardar se aplica a <strong>todas tus ligas</strong>.
            Después podés cambiarlos por liga si querés.
          </p>
        </div>
      )}

      {/* Save button — hidden once the tournament is locked */}
      {!isTournamentLocked && (
        <div className="px-4 mt-4">
          {showSaved ? (
            <motion.div
              key="saved"
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
            <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving}>
              Guardar pronósticos
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
