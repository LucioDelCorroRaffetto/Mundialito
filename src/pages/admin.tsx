import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/cn';
import type { Match, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';

const PLACEHOLDER_TEAM: Team = {
  id: 0,
  code: '???',
  flag: '🏳️',
  name: '...',
  group: null,
  confederation: null,
};

function getTeam(teamMap: Map<number, Team> | undefined, id: number): Team {
  return teamMap?.get(id) ?? PLACEHOLDER_TEAM;
}

function formatKickoff(utc: string) {
  return new Date(utc).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

interface UpdateMatchPayload {
  homeScore?: number;
  awayScore?: number;
  status?: 'scheduled' | 'live' | 'finished';
}

function MatchAdminRow({ match, teamMap }: { match: Match; teamMap: Map<number, Team> | undefined }) {
  const queryClient = useQueryClient();
  const homeTeam = getTeam(teamMap, match.homeTeamId);
  const awayTeam = getTeam(teamMap, match.awayTeamId);

  const [homeScore, setHomeScore] = useState(match.homeScore?.toString() ?? '');
  const [awayScore, setAwayScore] = useState(match.awayScore?.toString() ?? '');
  const [status, setStatus] = useState<'scheduled' | 'live' | 'finished'>(match.status);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: UpdateMatchPayload) => {
      const { data } = await apiClient.put(`/admin/matches/${match.id}`, payload);
      return data;
    },
    onSuccess: () => {
      setSaved(true);
      setErrorMsg(null);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', match.id] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Error al guardar';
      setErrorMsg(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSaved(false);
    const payload: UpdateMatchPayload = { status };
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (!isNaN(hs)) payload.homeScore = hs;
    if (!isNaN(as_)) payload.awayScore = as_;
    mutation.mutate(payload);
  }

  return (
    <div className="p-4 rounded-lg bg-card border border-border flex flex-col gap-3">
      {/* Match header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text">
            <TeamFlag code={homeTeam.code} emoji={homeTeam.flag} size={16} /> {homeTeam.name} <span className="text-muted font-normal">vs</span> {awayTeam.name} <TeamFlag code={awayTeam.code} emoji={awayTeam.flag} size={16} />
          </p>
          <p className="text-xs text-muted mt-0.5">
            #{match.matchNumber} · {match.group ? `Grupo ${match.group}` : match.round.toUpperCase()} · {formatKickoff(match.kickoffUtc)}
          </p>
        </div>
        <span
          className={cn(
            'text-xs font-bold px-2 py-0.5 rounded-full',
            match.status === 'finished' && 'bg-green-900/40 text-green-400',
            match.status === 'live' && 'bg-red-900/40 text-red-400',
            match.status === 'scheduled' && 'bg-elevated text-muted'
          )}
        >
          {match.status}
        </span>
      </div>

      {/* Current score if set */}
      {(match.homeScore !== null || match.awayScore !== null) && (
        <p className="text-xs text-muted">
          Marcador actual: <span className="font-bold text-text">{match.homeScore ?? '?'} - {match.awayScore ?? '?'}</span>
        </p>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <Input
            label={`${homeTeam.name}`}
            type="number"
            min={0}
            max={30}
            placeholder="0"
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            className="text-center"
            name={`home-${match.id}`}
          />
          <span className="pb-3 text-muted font-bold text-lg">-</span>
          <Input
            label={`${awayTeam.name}`}
            type="number"
            min={0}
            max={30}
            placeholder="0"
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            className="text-center"
            name={`away-${match.id}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text">Estado</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'scheduled' | 'live' | 'finished')}
            className="h-12 px-4 rounded-md bg-elevated border border-border text-text text-base focus:outline-none focus:border-accent transition-colors"
          >
            <option value="scheduled">scheduled</option>
            <option value="live">live</option>
            <option value="finished">finished</option>
          </select>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={14} />
            {errorMsg}
          </div>
        )}

        <Button
          type="submit"
          size="sm"
          loading={mutation.isPending}
          variant={saved ? 'secondary' : 'primary'}
          className={saved ? 'text-green-400' : undefined}
        >
          {saved ? (
            <>
              <CheckCircle2 size={14} />
              Guardado
            </>
          ) : (
            'Actualizar partido'
          )}
        </Button>
      </form>
    </div>
  );
}

interface SyncResult {
  synced: number;
  errors: number;
  matchesChecked: number;
}

function SyncScoresButton() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ data: SyncResult }>('/admin/sync-scores');
      return data.data;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  return (
    <div className="mx-4 mb-4 p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Sincronizar marcadores</p>
          <p className="text-xs text-muted mt-0.5">Actualiza scores desde football-data.org y recalcula puntos</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={syncMutation.isPending}
          onClick={() => { setResult(null); syncMutation.mutate(); }}
          className="flex-shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
          Sincronizar
        </Button>
      </div>
      {result && (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 size={13} />
          <span>{result.synced} actualizado{result.synced !== 1 ? 's' : ''} · {result.matchesChecked} revisado{result.matchesChecked !== 1 ? 's' : ''}{result.errors > 0 ? ` · ${result.errors} error${result.errors !== 1 ? 'es' : ''}` : ''}</span>
        </div>
      )}
      {syncMutation.isError && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle size={13} />
          {(syncMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Error al sincronizar'}
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const { data: matchesResponse, isLoading, error } = useMatches({ limit: 200 });
  const { data: teamMap } = useTeamMap();
  const allMatches = matchesResponse?.data ?? [];

  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all');
  const [search, setSearch] = useState('');

  const filtered = allMatches.filter((m) => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const home = teamMap?.get(m.homeTeamId);
      const away = teamMap?.get(m.awayTeamId);
      return (
        home?.name.toLowerCase().includes(q) ||
        away?.name.toLowerCase().includes(q) ||
        String(m.matchNumber).includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={22} className="text-accent" />
          <h1 className="text-2xl font-display font-bold text-text">Admin — Partidos</h1>
        </div>
        <p className="text-sm text-muted">Actualiza marcadores y estado. Al marcar como "finished" se calculan los puntos.</p>
      </div>

      {/* Sync scores */}
      <SyncScoresButton />

      {/* Filters */}
      <div className="px-4 pb-4 flex flex-col gap-3">
        <input
          type="text"
          placeholder="Buscar equipo o número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-4 rounded-md bg-elevated border border-border text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-1">
          {(['all', 'scheduled', 'live', 'finished'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                filterStatus === s
                  ? 'bg-accent text-accent-on'
                  : 'bg-card border border-border text-muted hover:text-text'
              )}
            >
              {s === 'all' ? 'Todos' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-20 flex flex-col gap-3">
        {isLoading && <p className="text-sm text-muted">Cargando partidos...</p>}
        {error && <p className="text-sm text-red-400">Error al cargar: {String((error as Error).message)}</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-3xl mb-3">⚽</p>
            <p className="text-base font-semibold text-text">Sin partidos</p>
          </div>
        )}

        {filtered.map((match) => (
          <MatchAdminRow key={match.id} match={match} teamMap={teamMap} />
        ))}
      </div>
    </div>
  );
}
