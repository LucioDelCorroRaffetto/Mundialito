import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUserProfile } from '@/shared/hooks/use-user-profile';
import { useEnrichedUserPredictionHistory } from '@/shared/hooks/use-enriched-history';
import { UserPredictionHistoryRow } from '@/shared/components/user-prediction-history-row';
import { staggerContainer, useMotionPrefs } from '@/shared/lib/motion';

/**
 * Página dedicada con el historial COMPLETO de pronósticos de OTRO usuario.
 * Se llega desde el "Ver todas" del perfil ajeno. El gate de visibilidad
 * (solo partidos ya arrancados) lo aplica el backend; acá solo renderizamos.
 */
export function UserPredictionsPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { reduced } = useMotionPrefs();

  const userId = Number(userIdParam);

  // Los hooks van SIEMPRE antes de cualquier return condicional: si el early
  // return quedaba arriba, al ver el perfil propio React renderizaba menos
  // hooks que en el caso ajeno y rompía el orden de hooks (rules-of-hooks).
  const { data: profile } = useUserProfile(isNaN(userId) ? undefined : userId);
  const { data, isLoading, isError } = useEnrichedUserPredictionHistory(isNaN(userId) ? undefined : userId);
  const items = data ?? [];

  // Si es uno mismo, mandar a la versión propia.
  if (!isNaN(userId) && currentUser && userId === currentUser.id) {
    return <Navigate to="/profile/predictions" replace />;
  }

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
          <h1 className="text-lg-s font-display font-bold text-text truncate">
            {profile ? `Pronósticos de ${profile.username}` : 'Pronósticos'}
          </h1>
          {items.length > 0 && (
            <p className="text-xs-s text-muted">{items.length} partido{items.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      <div className="px-4">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-elevated animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-xs-s text-red-400 text-center py-4">
            No se pudieron cargar los pronósticos.
          </p>
        )}

        {data && items.length === 0 && (
          <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2">
            <span className="text-3xl opacity-40" aria-hidden>🔮</span>
            <p className="text-sm-s text-muted text-center">Todavía no jugó ningún partido</p>
            <p className="text-xs-s text-muted/70 text-center">
              Sus pronósticos se muestran cuando arranca cada partido
            </p>
          </div>
        )}

        {items.length > 0 && (
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {items.map((item) => (
              <UserPredictionHistoryRow key={item.predictionId} item={item} reduced={reduced} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
