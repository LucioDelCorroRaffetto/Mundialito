import { useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, ChevronRight, History, Swords } from 'lucide-react';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUserProfile } from '@/shared/hooks/use-user-profile';
import { useEnrichedUserPredictionHistory } from '@/shared/hooks/use-enriched-history';
import { UserLevelBadge, UserLevelCard } from '@/shared/components/user-level-badge';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { HistoryRow } from '@/shared/components/prediction-history-row';
import { StatCard } from '@/shared/components/stat-card';
import { toHistoryEntry } from '@/shared/lib/adapt-user-history';
import { computeLevel } from '@/shared/lib/levels';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';
import type { Achievement } from '@/shared/hooks/use-achievements';

// Cuántos pronósticos se muestran en la vista previa del perfil antes de
// ofrecer "Ver todas" hacia la página dedicada con el historial completo.
const HISTORY_PREVIEW_COUNT = 5;

function PredictionHistorySection({ userId }: { userId: number }) {
  const { reduced } = useMotionPrefs();
  const { data, isLoading } = useEnrichedUserPredictionHistory(userId);
  const entries = data ?? [];
  // Solo mostramos los primeros N acá; el resto vive en la página dedicada.
  const preview = entries.slice(0, HISTORY_PREVIEW_COUNT);
  const hasMore = entries.length > HISTORY_PREVIEW_COUNT;

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base-s font-display font-bold text-text">
          Historial de pronósticos
        </h2>
        <History size={16} className="text-accent" />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-elevated animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2 text-center">
          <span className="text-2xl-s">⚽</span>
          <p className="text-sm-s font-semibold text-text">Todavía no jugó ningún partido</p>
          <p className="text-xs-s text-muted">
            Sus pronósticos aparecerán acá cuando los partidos arranquen.
          </p>
        </div>
      ) : (
        <>
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {preview.map((item) => (
              <motion.div key={item.predictionId} variants={staggerItem(reduced)}>
                <HistoryRow entry={toHistoryEntry(item)} />
              </motion.div>
            ))}
          </motion.div>

          {hasMore && (
            <Link
              to={`/u/${userId}/predictions`}
              className="mt-3 flex items-center justify-center gap-1 py-2.5 rounded-lg bg-card border border-border text-sm-s font-semibold text-accent hover:border-accent-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Ver todas ({entries.length})
              <ChevronRight size={16} />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export function UserProfilePage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { reduced } = useMotionPrefs();

  const userId = Number(userIdParam);

  // Los hooks van SIEMPRE antes de cualquier return condicional: el early
  // return de "es uno mismo" estaba arriba y dejaba sin llamar a useUserProfile
  // y useState al ver el perfil propio, rompiendo el orden de hooks.
  const { data: profile, isLoading, isError } = useUserProfile(isNaN(userId) ? undefined : userId);
  // Selected achievement for the Pokémon-style modal. We let viewers open
  // any other user's logro card just like they can on their own profile —
  // it's a public showcase, no reason to gate it.
  const [selectedCard, setSelectedCard] = useState<
    { achievement: Achievement; earned: boolean; earnedAt?: string } | null
  >(null);

  // Redirect to own profile if viewing self
  if (!isNaN(userId) && currentUser && userId === currentUser.id) {
    return <Navigate to="/profile" replace />;
  }

  const BackButton = (
    <button
      onClick={() => navigate(-1)}
      className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border hover:border-accent-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Volver"
    >
      <ArrowLeft size={18} className="text-text" />
    </button>
  );

  const compareHref = currentUser ? `/h2h/${currentUser.id}/${userId}` : null;

  if (isNaN(userId)) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">{BackButton}</div>
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-sm-s text-muted">Usuario no encontrado</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
        <div className="flex items-center gap-4 px-4 pt-6">{BackButton}</div>
        <div className="px-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-elevated animate-pulse flex-shrink-0" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-32 rounded bg-elevated animate-pulse" />
            <div className="h-3 w-48 rounded bg-elevated animate-pulse" />
          </div>
        </div>
        <div className="px-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-elevated animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">{BackButton}</div>
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-sm-s text-muted">Usuario no encontrado</p>
        </div>
      </div>
    );
  }

  const avatarInitial = profile.username.charAt(0).toUpperCase();
  const isAdmin       = profile.isAdmin;
  const ap            = profile.adminProfile;
  // Level info — backend already returns it but we recompute locally as a
  // fallback for older cached blobs that may not carry the `level` field.
  const levelInfo = profile.level ?? computeLevel(0);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center gap-4 px-4 pt-6">
        {BackButton}
        <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl-s font-display font-bold text-accent-on">{avatarInitial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl-s font-display font-bold text-text truncate">{profile.username}</h1>
            {!isAdmin && <UserLevelBadge level={levelInfo} />}
            {isAdmin && (
              <span className="text-xs-s font-semibold text-accent">🏛️ FIFA</span>
            )}
          </div>
          {profile.title && (
            <p className="text-xs-s text-accent italic">{profile.title.name}</p>
          )}
          {ap && <p className="text-sm-s text-muted truncate">{ap.role}</p>}
          {!ap && profile.leagueCount > 0 && (
            <p className="text-sm-s text-muted truncate">
              {profile.leagueCount} liga{profile.leagueCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {!isAdmin && compareHref && (
          <Link
            to={compareHref}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-card border border-border text-xs-s font-semibold text-accent hover:border-accent-border transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Swords size={14} />
            Comparar
          </Link>
        )}
      </div>

      {!isAdmin && (
        <div className="px-4">
          <UserLevelCard level={levelInfo} />
        </div>
      )}

      {ap && (
        <div className="px-4">
          <div className="p-4 rounded-lg bg-card border border-border italic text-sm-s text-text">
            "{ap.bio}"
          </div>
        </div>
      )}

      <div className="px-4">
        <h2 className="text-base-s font-display font-bold text-text mb-3">Estadísticas</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="🎯 Predicciones" value={profile.stats.totalPredictions} />
          <StatCard label="⚽ Exactos" value={profile.stats.exactScores} />
          <StatCard label="✅ Resultados" value={profile.stats.correctResults} />
          <StatCard label="🏆 Puntos" value={profile.stats.totalPoints} />
          <StatCard label="📊 % Acierto" value={`${profile.stats.accuracy ?? 0}%`} />
        </div>
      </div>

      {profile.fantasyPoints > 0 && (
        <div className="px-4">
          <div className="p-3 rounded-lg bg-card border border-border flex items-center gap-3">
            <span className="text-xl">🧠</span>
            <div className="flex-1">
              <p className="text-sm-s font-semibold text-text">Gran DT</p>
              <p className="text-xs-s text-muted">{profile.fantasyPoints} pts fantasy</p>
            </div>
          </div>
        </div>
      )}

      {/* Solo partidos ya arrancados (el gate vive en el backend). El admin
          (cuenta FIFA) no pronostica, así que mostrará el estado vacío. */}
      <PredictionHistorySection userId={profile.id} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base-s font-display font-bold text-text">
            Logros ({profile.achievements.length})
          </h2>
          <Star size={16} className="text-accent" />
        </div>

        {profile.achievements.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2 text-center">
            <span className="text-2xl-s">🏅</span>
            <p className="text-sm-s font-semibold text-text">Todavía sin logros</p>
            <p className="text-xs-s text-muted">Hacé pronósticos y unite a ligas para empezar</p>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {profile.achievements.map((a) => (
              <motion.button
                key={a.slug}
                type="button"
                onClick={() =>
                  setSelectedCard({ achievement: a as Achievement, earned: true, earnedAt: a.earnedAt })
                }
                variants={staggerItem(reduced)}
                whileHover={reduced ? undefined : { y: -1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-accent-border text-left hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-2xl-s">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm-s font-semibold text-text">{a.name}</p>
                  <p className="text-xs-s text-muted">{a.description}</p>
                </div>
                <span className="text-xs-s text-accent font-semibold">+{a.xpReward} XP</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      <AchievementCardModal
        achievement={selectedCard?.achievement ?? null}
        earned={selectedCard?.earned ?? false}
        earnedAt={selectedCard?.earnedAt}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  );
}
