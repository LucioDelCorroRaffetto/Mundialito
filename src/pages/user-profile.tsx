import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUserProfile } from '@/shared/hooks/use-user-profile';

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/40',
  gold: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40',
  silver: 'bg-slate-400/20 text-slate-300 border-slate-400/40',
  bronze: 'bg-amber-700/20 text-amber-500 border-amber-700/40',
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
}

export function UserProfilePage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const userId = Number(userIdParam);

  // Redirect to own profile if viewing self
  if (!isNaN(userId) && currentUser && userId === currentUser.id) {
    return <Navigate to="/profile" replace />;
  }

  const { data: profile, isLoading, isError } = useUserProfile(isNaN(userId) ? undefined : userId);

  if (isNaN(userId)) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
        </div>
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-sm-s text-muted">Usuario no encontrado</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="animate-pulse h-5 bg-white/10 rounded w-32 mb-1" />
            <div className="animate-pulse h-3 bg-white/10 rounded w-20" />
          </div>
        </div>
        <div className="px-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-[72px] h-[72px] rounded-full bg-elevated animate-pulse flex-shrink-0" />
            <div className="flex flex-col gap-2">
              <div className="h-5 w-36 rounded bg-elevated animate-pulse" />
              <div className="h-3 w-24 rounded bg-elevated animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-elevated animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
        </div>
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-sm-s text-muted">Usuario no encontrado</p>
        </div>
      </div>
    );
  }

  const avatarInitial = profile.username.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-6 pb-8 animate-fade-in">
      {/* Header / back button */}
      <div className="flex items-center gap-3 px-4 pt-5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-md bg-elevated border border-border"
          aria-label="Volver"
        >
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-lg-s font-display font-bold text-text">Perfil</h1>
      </div>

      {/* Avatar + username + league count */}
      <div className="flex items-center gap-4 px-4">
        <div className="w-[72px] h-[72px] rounded-full bg-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl-s font-display font-bold text-accent-on">{avatarInitial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl-s font-display font-bold text-text truncate">{profile.username}</h2>
          {profile.leagueCount > 0 && (
            <p className="text-sm-s text-muted">
              {profile.leagueCount} liga{profile.leagueCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4">
        <h3 className="text-base-s font-display font-bold text-text mb-3">Estadísticas</h3>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="🏆 Puntos" value={profile.stats.totalPoints} />
          <StatCard label="⚽ Exactos" value={profile.stats.exactScores} />
          <StatCard label="🎯 Jugados" value={profile.stats.totalPredictions} />
        </div>
      </div>

      {/* Fantasy points */}
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

      {/* Achievements */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base-s font-display font-bold text-text">Logros</h3>
          <Star size={16} className="text-accent" />
        </div>
        {profile.achievements.length === 0 ? (
          <p className="text-sm-s text-muted">Todavía sin logros</p>
        ) : (
          <div className="flex flex-col gap-2">
            {profile.achievements.map((a, i) => (
              <motion.div
                key={a.slug}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="p-3 rounded-lg bg-card border border-border flex items-center gap-3"
              >
                <span className="text-2xl-s">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm-s font-semibold text-text">{a.name}</p>
                  <p className="text-xs-s text-muted">{a.description}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0',
                    TIER_COLORS[a.tier] ?? 'bg-elevated text-muted border-border'
                  )}
                >
                  {a.tier}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
