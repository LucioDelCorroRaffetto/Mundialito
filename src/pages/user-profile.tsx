import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUserProfile } from '@/shared/hooks/use-user-profile';

// Tier chip colours with explicit light + dark variants. Without these the
// chip is invisible on white (yellow/cyan/slate-300 fade into nothing).
const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-cyan-400/25 text-cyan-700 border-cyan-500/60 dark:bg-cyan-400/20 dark:text-cyan-300 dark:border-cyan-400/40',
  gold:     'bg-yellow-400/30 text-amber-700 border-yellow-500/60 dark:bg-yellow-400/20 dark:text-yellow-300 dark:border-yellow-400/40',
  silver:   'bg-slate-300/40 text-slate-700 border-slate-400/60 dark:bg-slate-400/20 dark:text-slate-300 dark:border-slate-400/40',
  bronze:   'bg-amber-600/25 text-amber-800 border-amber-600/60 dark:bg-amber-700/20 dark:text-amber-500 dark:border-amber-700/40',
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
}

/** Shimmering gold ring used around the admin avatar */
function GoldRing({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex-shrink-0">
      {/* animated gradient ring */}
      <div className="absolute inset-0 rounded-full p-[3px] bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 animate-spin-slow" />
      <div className="relative w-[72px] h-[72px] rounded-full overflow-hidden border-2 border-black">
        {children}
      </div>
    </div>
  );
}

/** The presidential badge chip shown next to the username */
function PresidentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0
                     bg-gradient-to-r from-yellow-400/40 to-amber-400/40 border-amber-500 text-amber-800
                     dark:from-yellow-500/20 dark:to-amber-500/20 dark:border-yellow-500/40 dark:text-yellow-300
                     border">
      🏛️ FIFA
    </span>
  );
}

/**
 * Generate a stable, distinctive hue for a given userId. Used to colour the
 * non-admin profile header so every user gets a small personal flourish
 * instead of the generic dark banner. Multiplier 137 is the golden-angle
 * approximation, which spreads hues evenly across the wheel.
 */
function userHue(userId: number): number {
  return (userId * 137) % 360;
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
  const isAdmin       = profile.isAdmin;
  const ap            = profile.adminProfile;

  const avatarEl = (
    <div className="w-full h-full bg-accent flex items-center justify-center">
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
      ) : (
        <span className={cn('font-display font-bold text-accent-on', isAdmin ? 'text-4xl' : 'text-3xl-s')}>
          {avatarInitial}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-8 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {isAdmin ? (
        /* Presidential header — gold gradient banner. In light mode we boost
            the gradient density and switch the title to amber-700 because
            yellow-300 disappears on white. */
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/25 via-amber-500/15 to-transparent dark:from-yellow-500/10 dark:via-amber-500/5 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-600/50 dark:via-yellow-500/30 to-transparent" />

          <div className="relative flex items-center gap-3 px-4 pt-5 pb-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-md bg-elevated border border-border"
              aria-label="Volver"
            >
              <ArrowLeft size={18} className="text-text" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg-s font-display font-bold text-amber-700 dark:text-yellow-300">Perfil Oficial</h1>
              <p className="text-xs-s text-amber-700/70 dark:text-yellow-500/70">FIFA World Cup 2026™</p>
            </div>
            <span className="text-2xl">🏆</span>
          </div>
        </div>
      ) : (
        /* Normal header — personalised gradient band per user. Hue is derived
            from the userId so it's stable but distinctive between profiles. */
        <div className="relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, hsl(${userHue(profile.id)} 55% 45% / 0.18), transparent 80%)`,
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{
              background: `linear-gradient(to right, transparent, hsl(${userHue(profile.id)} 70% 55% / 0.35), transparent)`,
            }}
          />
          <div className="relative flex items-center gap-3 px-4 pt-5 pb-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-md bg-elevated border border-border"
              aria-label="Volver"
            >
              <ArrowLeft size={18} className="text-text" />
            </button>
            <h1 className="text-lg-s font-display font-bold text-text">Perfil</h1>
          </div>
        </div>
      )}

      {/* ── Avatar + name ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4">
        {isAdmin ? (
          <GoldRing>{avatarEl}</GoldRing>
        ) : (
          <div
            className="w-[72px] h-[72px] rounded-full bg-accent flex items-center justify-center flex-shrink-0 overflow-hidden ring-2"
            style={{ '--tw-ring-color': `hsl(${userHue(profile.id)} 65% 55% / 0.6)` } as React.CSSProperties}
          >
            {avatarEl}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={cn(
              'text-xl-s font-display font-bold truncate',
              isAdmin ? 'text-amber-700 dark:text-yellow-200' : 'text-text',
            )}>
              {profile.username}
            </h2>
            {isAdmin && <PresidentBadge />}
          </div>

          {ap && (
            <p className="text-xs-s font-medium mt-0.5 text-amber-700/80 dark:text-yellow-500/80">{ap.role}</p>
          )}
          {!ap && profile.leagueCount > 0 && (
            <p className="text-sm-s text-muted">
              {profile.leagueCount} liga{profile.leagueCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── Bio (admin only) — dual mode: warm parchment in light, soft gold
            on dark. The italic body text needs strong contrast against the
            tinted background or the quote disappears. */}
      {ap && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-4 p-4 rounded-xl border bg-gradient-to-br from-amber-100 to-yellow-50 border-amber-400/50 dark:from-yellow-500/10 dark:to-amber-600/5 dark:border-yellow-500/20"
        >
          <p className="text-sm-s leading-relaxed italic text-amber-900 dark:text-yellow-100/80">
            "{ap.bio}"
          </p>
          <p className="text-xs-s mt-2 text-right text-amber-700/80 dark:text-yellow-500/60">— {profile.username}, {ap.role}</p>
        </motion.div>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="px-4">
        <h3 className="text-base-s font-display font-bold text-text mb-3">Estadísticas</h3>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="🏆 Puntos"  value={profile.stats.totalPoints} />
          <StatCard label="⚽ Exactos" value={profile.stats.exactScores} />
          <StatCard label="🎯 Jugados" value={profile.stats.totalPredictions} />
        </div>
      </div>

      {/* ── Fantasy points ─────────────────────────────────────────────── */}
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

      {/* ── Achievements ───────────────────────────────────────────────── */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base-s font-display font-bold text-text">Logros</h3>
          <Star size={16} className="text-accent" />
        </div>
        {profile.achievements.length === 0 ? (
          <p className="text-sm-s text-muted">Todavía sin logros</p>
        ) : (
          <div className="flex flex-col gap-2">
            {profile.achievements.map((a, i) => {
              const isPresidentBadge = a.slug === 'presidente_fifa';
              return (
                <motion.div
                  key={a.slug}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    'p-3 rounded-lg border flex items-center gap-3',
                    isPresidentBadge
                      ? 'bg-gradient-to-r from-amber-100 to-yellow-50 border-amber-400/60 dark:from-yellow-500/10 dark:to-amber-600/5 dark:border-yellow-500/30'
                      : 'bg-card border-border',
                  )}
                >
                  <span className="text-2xl-s">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm-s font-semibold',
                      isPresidentBadge ? 'text-amber-800 dark:text-yellow-200' : 'text-text',
                    )}>
                      {a.name}
                    </p>
                    <p className={cn(
                      'text-xs-s',
                      isPresidentBadge ? 'text-amber-700/80 dark:text-muted' : 'text-muted',
                    )}>{a.description}</p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0',
                      isPresidentBadge
                        ? 'bg-yellow-400/40 text-amber-800 border-amber-500/60 dark:bg-yellow-400/20 dark:text-yellow-300 dark:border-yellow-400/40'
                        : (TIER_COLORS[a.tier] ?? 'bg-elevated text-muted border-border'),
                    )}
                  >
                    {isPresidentBadge ? '🏛️ FIFA' : a.tier}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
