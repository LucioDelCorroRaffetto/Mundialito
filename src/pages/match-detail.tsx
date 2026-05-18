import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, CheckCircle2, Share2 } from 'lucide-react';
import { MATCHES, MY_PREDICTIONS, ROUND_LABELS, PLAYERS } from '@/shared/data/mock';
import { getMaxPossiblePoints } from '@/shared/lib/scoring';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { sharePredictionCard } from '@/shared/lib/generate-prediction-card';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUpsertPrediction } from '@/shared/hooks/use-predictions';

function PointsPreview({ home, away, scorerCount }: { home: number; away: number; scorerCount: number }) {
  const { isDraw, ifExact, ifWinnerDiff } = getMaxPossiblePoints(home, away);
  const scorerPts = scorerCount * 2;
  return (
    <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border">
      <p className="text-sm-s font-semibold text-text mb-2">
        📊 Puntos posibles con {home} - {away}
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm-s text-muted">{isDraw ? 'Empate exacto' : 'Resultado exacto'}</span>
          <span className="text-sm-s font-bold text-accent">+{ifExact} pts</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm-s text-muted">{isDraw ? 'Empate acertado' : 'Resultado correcto'}</span>
          <span className="text-sm-s font-bold text-accent">+{ifWinnerDiff} pt{ifWinnerDiff !== 1 ? 's' : ''}</span>
        </div>
        {scorerCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm-s text-muted">Goleadores ({scorerCount})</span>
            <span className="text-sm-s font-bold text-accent">+{scorerPts} pts</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScorerPicker({
  team, maxGoals, selected, onChange,
}: {
  team: { code: string; flag: string; name: string };
  maxGoals: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const teamPlayers = PLAYERS.filter(
    (p) => p.teamCode === team.code && (p.position === 'FWD' || p.position === 'MID')
  );

  const togglePlayer = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < maxGoals) {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{team.flag}</span>
        <span className="text-sm-s font-semibold text-text">{team.code}</span>
        <span className="text-xs-s text-muted ml-auto">
          {selected.length} / {maxGoals}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {teamPlayers.map((p) => {
          const isSelected = selected.includes(p.id);
          const isDisabled = !isSelected && selected.length >= maxGoals;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePlayer(p.id)}
              disabled={isDisabled}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs-s font-medium border transition-colors',
                isSelected
                  ? 'bg-accent text-accent-on border-accent'
                  : isDisabled
                  ? 'bg-elevated border-border text-muted opacity-50 cursor-not-allowed'
                  : 'bg-elevated border-border text-text hover:border-accent-border'
              )}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  team,
}: {
  value: number;
  onChange: (v: number) => void;
  team: { code: string; flag: string; name: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xl-s">{team.flag}</span>
      <span className="text-base-s font-bold text-text">{team.code}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          −
        </button>
        <span className="w-10 text-center text-3xl-s font-display font-bold text-accent">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

function formatDate(utc: string) {
  const d = new Date(utc);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
}

export function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leagueIdParam = searchParams.get('leagueId');
  const leagueId = leagueIdParam ? Number(leagueIdParam) : null;

  const match = MATCHES.find((m) => m.id === Number(id));
  if (!match) { navigate('/matches', { replace: true }); return null; }
  const existingPrediction = MY_PREDICTIONS.find((p) => p.matchId === match.id);

  const [homeScore, setHomeScore] = useState(existingPrediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existingPrediction?.awayScore ?? 0);
  const [homeScorers, setHomeScorers] = useState<number[]>([]);
  const [awayScorers, setAwayScorers] = useState<number[]>([]);
  const [saved, setSaved] = useState(!!existingPrediction);
  const [sharing, setSharing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const username = useAuthStore((s) => s.user?.username);
  const upsertMutation = useUpsertPrediction();

  const handleShare = async () => {
    setSharing(true);
    try {
      await sharePredictionCard({
        homeFlag: match.homeTeam.flag,
        homeName: match.homeTeam.name,
        homeCode: match.homeTeam.code,
        homeScore,
        awayFlag: match.awayTeam.flag,
        awayName: match.awayTeam.name,
        awayCode: match.awayTeam.code,
        awayScore,
        username,
        accentColor:
          getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || undefined,
      });
    } catch (e) {
      console.error('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  const updateHomeScore = (v: number) => {
    setHomeScore(v);
    if (homeScorers.length > v) setHomeScorers(homeScorers.slice(0, v));
    setSaved(false);
  };

  const updateAwayScore = (v: number) => {
    setAwayScore(v);
    if (awayScorers.length > v) setAwayScorers(awayScorers.slice(0, v));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!leagueId) {
      setSaveError('Necesitás abrir el partido desde una liga (no hay leagueId).');
      return;
    }
    setSaveError(null);
    try {
      await upsertMutation.mutateAsync({
        matchId: match.id,
        leagueId,
        homeScore,
        awayScore,
      });
      setSaved(true);
    } catch (e: any) {
      setSaveError(e?.response?.data?.error?.message ?? 'Error al guardar pronóstico');
    }
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div>
          <span className="text-xs-s text-muted">
            {match.group ? `Grupo ${match.group}` : ROUND_LABELS[match.round]}
          </span>
          <p className="text-base-s font-bold text-text">Partido #{match.matchNumber}</p>
        </div>
      </div>

      <div className="mx-4 p-5 rounded-xl bg-card border border-border shadow-card">
        <div className="flex items-center justify-around gap-4">
          <ScoreInput value={homeScore} onChange={updateHomeScore} team={match.homeTeam} />
          <span className="text-2xl-s font-display font-bold text-muted">vs</span>
          <ScoreInput value={awayScore} onChange={updateAwayScore} team={match.awayTeam} />
        </div>
      </div>

      <div className="mx-4 mt-3 p-4 rounded-lg bg-elevated border border-border flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted flex-shrink-0" />
          <span className="text-sm-s text-text capitalize">{formatDate(match.kickoffUtc)} · {formatTime(match.kickoffUtc)}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-muted flex-shrink-0" />
          <span className="text-sm-s text-text">{match.venue}, {match.city}</span>
        </div>
      </div>

      {(homeScore + awayScore) > 0 && (
        <div className="mx-4 mt-3 p-4 rounded-lg bg-card border border-border">
          <p className="text-sm-s font-semibold text-text mb-3">⚽ Goleadores (opcional · +2 pts c/u)</p>
          <div className="flex flex-col gap-3">
            {homeScore > 0 && (
              <ScorerPicker
                team={match.homeTeam}
                maxGoals={homeScore}
                selected={homeScorers}
                onChange={(ids) => { setHomeScorers(ids); setSaved(false); }}
              />
            )}
            {awayScore > 0 && (
              <ScorerPicker
                team={match.awayTeam}
                maxGoals={awayScore}
                selected={awayScorers}
                onChange={(ids) => { setAwayScorers(ids); setSaved(false); }}
              />
            )}
          </div>
        </div>
      )}

      <PointsPreview home={homeScore} away={awayScore} scorerCount={homeScorers.length + awayScorers.length} />

      <div className="px-4 mt-4">
        {saved ? (
          <>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500/15 border border-green-500/30"
            >
              <CheckCircle2 size={18} className="text-green-400" />
              <span className="text-sm-s font-semibold text-green-400">
                Pronóstico guardado · {homeScore} - {awayScore}
              </span>
            </motion.div>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-accent-border text-accent text-sm-s font-semibold hover:bg-accent-soft transition-colors disabled:opacity-50"
            >
              <Share2 size={16} />
              {sharing ? 'Generando imagen...' : 'Compartir como imagen'}
            </button>
          </>
        ) : (
          <>
            <Button fullWidth size="lg" onClick={handleSave} loading={upsertMutation.isPending}>
              {existingPrediction ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
            </Button>
            {saveError && (
              <p className="text-xs-s text-red-400 mt-2 text-center">{saveError}</p>
            )}
          </>
        )}
      </div>

      <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-2">Sistema de puntuación</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['Marcador exacto', '5 pts'],
            ['Ganador + diferencia', '3 pts'],
            ['Ganador correcto', '1 pt'],
            ['Empate acertado', '1 pt'],
            ['Goleador acertado', '+2 pts c/u'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
