import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { MATCHES, MY_PREDICTIONS, ROUND_LABELS } from '@/shared/data/mock';
import { Button } from '@/shared/components/ui/button';

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

  const match = MATCHES.find((m) => m.id === Number(id)) ?? MATCHES[0];
  const existingPrediction = MY_PREDICTIONS.find((p) => p.matchId === match.id);

  const [homeScore, setHomeScore] = useState(existingPrediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existingPrediction?.awayScore ?? 0);
  const [saved, setSaved] = useState(!!existingPrediction);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setSaved(true);
    setSaving(false);
  };

  const ScoreInput = ({
    value,
    onChange,
    team,
  }: {
    value: number;
    onChange: (v: number) => void;
    team: typeof match.homeTeam;
  }) => (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xl-s">{team.flag}</span>
      <span className="text-base-s font-bold text-text">{team.code}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { onChange(Math.max(0, value - 1)); setSaved(false); }}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          −
        </button>
        <span className="w-10 text-center text-3xl-s font-display font-bold text-accent">{value}</span>
        <button
          onClick={() => { onChange(value + 1); setSaved(false); }}
          className="w-9 h-9 rounded-full bg-elevated border border-border text-text text-lg font-bold hover:border-accent-border transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );

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
          <ScoreInput value={homeScore} onChange={setHomeScore} team={match.homeTeam} />
          <span className="text-2xl-s font-display font-bold text-muted">vs</span>
          <ScoreInput value={awayScore} onChange={setAwayScore} team={match.awayTeam} />
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

      <div className="px-4 mt-4">
        {saved ? (
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
        ) : (
          <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
            {existingPrediction ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
          </Button>
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
