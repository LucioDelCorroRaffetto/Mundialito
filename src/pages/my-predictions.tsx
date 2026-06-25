import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useMyPredictionHistory } from '@/shared/hooks/use-predictions';
import { HistoryRow } from '@/shared/components/prediction-history-row';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';

/**
 * Página dedicada con el historial COMPLETO de pronósticos del usuario propio.
 * Se llega desde el "Ver todas" del perfil. Reusa la misma fila (HistoryRow)
 * que la vista previa, así la presentación es idéntica.
 */
export function MyPredictionsPage() {
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const { data, isLoading } = useMyPredictionHistory();
  const entries = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4 pb-8 animate-fade-in">
      {/* Header con botón volver */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-1">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Volver"
        >
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg-s font-display font-bold text-text">Historial de pronósticos</h1>
          {entries.length > 0 && (
            <p className="text-xs-s text-muted">{entries.length} partido{entries.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      <div className="px-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-elevated animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2 text-center">
            <span className="text-2xl-s">⚽</span>
            <p className="text-sm-s font-semibold text-text">Todavía no jugaste ningún partido</p>
            <p className="text-xs-s text-muted">
              Tus pronósticos aparecerán acá cuando los partidos arranquen.
            </p>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {entries.map((entry) => (
              <motion.div key={entry.predictionId} variants={staggerItem(reduced)}>
                <HistoryRow entry={entry} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
