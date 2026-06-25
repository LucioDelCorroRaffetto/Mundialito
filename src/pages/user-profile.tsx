import { useState, memo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Target, Crosshair, ClipboardList, Sparkles, ListChecks } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/auth-store';
import { useUserProfile, useUserPredictionHistory } from '@/shared/hooks/use-user-profile';
import type { UserPredictionHistoryItem } from '@/shared/hooks/use-user-profile';
import { UserLevelCard, UserLevelBadge } from '@/shared/components/user-level-badge';
import { AchievementCardModal } from '@/shared/components/achievement-card-modal';
import { computeLevel } from '@/shared/lib/levels';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';
import type { Achievement } from '@/shared/hooks/use-achievements';

// Tier chip colours with explicit light + dark variants. Without these the
// chip is invisible on white (yellow/cyan/slate-300 fade into nothing).
const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-cyan-400/25 text-cyan-700 border-cyan-500/60 dark:bg-cyan-400/20 dark:text-cyan-300 dark:border-cyan-400/40',
  gold:     'bg-yellow-400/30 text-amber-700 border-yellow-500/60 dark:bg-yellow-400/20 dark:text-yellow-300 dark:border-yellow-400/40',
  silver:   'bg-slate-300/40 text-slate-700 border-slate-400/60 dark:bg-slate-400/20 dark:text-slate-300 dark:border-slate-400/40',
  bronze:   'bg-amber-600/25 text-amber-800 border-amber-600/60 dark:bg-amber-700/20 dark:text-amber-500 dark:border-amber-700/40',
};

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  accentClass = 'text-accent',
  reduced = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentClass?: string;
  reduced?: boolean;
}) {
  return (
    <motion.div
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ type: 'spring', stiffness: 280, damping: 18 }}
      className="relative flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border overflow-hidden"
    >
      {/* Subtle radial glow behind the value so the number reads as the
          star of the card without making the whole tile glow. */}
      <div className={cn('absolute -top-6 left-1/2 w-16 h-16 -translate-x-1/2 rounded-full opacity-30 blur-2xl', accentClass.replace('text-', 'bg-'))} />
      <div className={cn('relative w-7 h-7 rounded-full flex items-center justify-center', accentClass)}>
        {icon}
      </div>
      <span className={cn('relative text-2xl-s font-display font-black tabular-nums', accentClass)}>{value}</span>
      <span className="relative text-[10px] text-muted text-center leading-tight uppercase tracking-wider font-bold">{label}</span>
    </motion.div>
  );
});

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

/** Chip de equipo (bandera + código) usado en cada fila del historial. */
function TeamChip({
  flag,
  code,
  name,
  align = 'start',
}: {
  flag: string | null;
  code: string | null;
  name: string | null;
  align?: 'start' | 'end';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 min-w-0',
        align === 'end' && 'flex-row-reverse',
      )}
    >
      <span className="text-base-s leading-none" aria-hidden>{flag ?? '🏳️'}</span>
      <span className="text-sm-s font-semibold text-text truncate" title={name ?? undefined}>
        {code ?? name ?? '—'}
      </span>
    </div>
  );
}

// Estilos semánticos por resultado del pronóstico. Definidos como objeto para
// que el color del marcador pronosticado y el badge de puntos sean coherentes.
const OUTCOME_STYLES: Record<
  UserPredictionHistoryItem['outcome'],
  { label: string; chip: string; score: string }
> = {
  exact: {
    label: 'Exacto',
    chip: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40 dark:text-emerald-400',
    score: 'text-emerald-600 dark:text-emerald-400',
  },
  correct: {
    label: 'Acertado',
    chip: 'bg-sky-500/15 text-sky-600 border-sky-500/40 dark:text-sky-400',
    score: 'text-sky-600 dark:text-sky-400',
  },
  missed: {
    label: 'Fallado',
    chip: 'bg-rose-500/15 text-rose-600 border-rose-500/40 dark:text-rose-400',
    score: 'text-muted',
  },
  pending: {
    label: 'En juego',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400',
    score: 'text-text',
  },
};

function PredictionHistoryRow({
  item,
  reduced,
}: {
  item: UserPredictionHistoryItem;
  reduced: boolean;
}) {
  const style = OUTCOME_STYLES[item.outcome];
  return (
    <motion.div
      variants={staggerItem(reduced)}
      className="p-3 rounded-xl bg-card border border-border flex flex-col gap-2"
    >
      {/* Fila de equipos + marcadores */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <TeamChip
            flag={item.homeTeam.flag}
            code={item.homeTeam.code}
            name={item.homeTeam.name}
          />
        </div>

        <div className="flex flex-col items-center gap-0.5 px-2 flex-shrink-0">
          {/* Marcador pronosticado (coloreado según resultado) */}
          <span className={cn('text-base-s font-display font-black tabular-nums', style.score)}>
            {item.prediction.homeScore} – {item.prediction.awayScore}
          </span>
          {/* Marcador real, si el partido ya tiene resultado */}
          {/* Marcador real solo cuando ya hay resultado. Si está pendiente no
              repetimos "en juego" acá: el chip de abajo ya lo dice. */}
          {item.result && (
            <span className="text-[10px] text-muted tabular-nums">
              Real {item.result.homeScore}–{item.result.awayScore}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <TeamChip
            flag={item.awayTeam.flag}
            code={item.awayTeam.code}
            name={item.awayTeam.name}
            align="end"
          />
        </div>
      </div>

      {/* Fila de resultado + puntos */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
            style.chip,
          )}
        >
          {style.label}
        </span>
        {item.points != null && (
          <span className="text-xs-s font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
            +{item.points} pts
          </span>
        )}
      </div>
    </motion.div>
  );
}

function PredictionHistorySection({
  userId,
  reduced,
}: {
  userId: number;
  reduced: boolean;
}) {
  const { data, isLoading, isError } = useUserPredictionHistory(userId);

  return (
    <div className="px-4">
      <h3 className="text-sm font-display font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
        <ListChecks size={14} className="text-accent" /> Pronósticos
        {data && data.length > 0 && (
          <span className="text-text font-black">· {data.length}</span>
        )}
      </h3>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-elevated animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-xs-s text-red-400 text-center py-4">
          No se pudieron cargar los pronósticos.
        </p>
      )}

      {data && data.length === 0 && (
        <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2">
          <span className="text-3xl opacity-40" aria-hidden>🔮</span>
          <p className="text-sm-s text-muted text-center">Todavía no jugó ningún partido</p>
          <p className="text-xs-s text-muted/70 text-center">
            Sus pronósticos se muestran cuando arranca cada partido
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <motion.div
          className="flex flex-col gap-2"
          variants={staggerContainer(reduced)}
          initial="initial"
          animate="animate"
        >
          {data.map((item) => (
            <PredictionHistoryRow key={item.predictionId} item={item} reduced={reduced} />
          ))}
        </motion.div>
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

  // Redirect to own profile if viewing self
  if (!isNaN(userId) && currentUser && userId === currentUser.id) {
    return <Navigate to="/profile" replace />;
  }

  const { data: profile, isLoading, isError } = useUserProfile(isNaN(userId) ? undefined : userId);
  // Selected achievement for the Pokémon-style modal. We let viewers open
  // any other user's logro card just like they can on their own profile —
  // it's a public showcase, no reason to gate it.
  const [selectedCard, setSelectedCard] = useState<
    { achievement: Achievement; earned: boolean; earnedAt?: string } | null
  >(null);

  if (isNaN(userId)) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Volver">
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
          <button onClick={() => navigate(-1)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Volver">
            <ArrowLeft size={18} className="text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="animate-pulse h-5 bg-black/10 dark:bg-white/10 rounded w-32 mb-1" />
            <div className="animate-pulse h-3 bg-black/10 dark:bg-white/10 rounded w-20" />
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
          <button onClick={() => navigate(-1)} className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Volver">
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
  // Level info — backend already returns it but we recompute locally as a
  // fallback for older cached blobs that may not carry the `level` field.
  const levelInfo = profile.level ?? computeLevel(0);
  const accuracy = profile.stats.accuracy ?? 0;

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
              className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18 }}
            className="relative flex-shrink-0"
          >
            {/* Tier-coloured halo behind the avatar. The hue still varies
                per user (so two same-tier profiles still look distinct),
                but the OUTER ring uses the tier colour so the prestige
                level is visible at a glance. */}
            <div
              className="absolute inset-0 rounded-full blur-md opacity-50"
              style={{ background: `hsl(${userHue(profile.id)} 65% 55%)` }}
            />
            <div
              className={cn(
                'relative w-[76px] h-[76px] rounded-full bg-accent flex items-center justify-center overflow-hidden ring-[3px] ring-offset-2 ring-offset-bg',
                levelInfo.tier.colorClass.replace('text-', 'ring-'),
              )}
            >
              {avatarEl}
            </div>
            {/* Level chip pinned to the avatar's bottom-right corner —
                shouts the tier+level without needing a separate row. */}
            <span
              className={cn(
                'absolute -bottom-1 -right-1 z-10 inline-flex items-center gap-0.5 rounded-full bg-card border border-border px-1.5 py-0.5 text-[10px] font-black shadow-md',
                levelInfo.tier.colorClass,
              )}
              title={`${levelInfo.tier.name} · Nivel ${levelInfo.level}`}
            >
              <span aria-hidden>{levelInfo.tier.icon}</span>
              <span>{levelInfo.level}</span>
            </span>
          </motion.div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={cn(
              'text-2xl font-display font-black truncate leading-tight',
              isAdmin ? 'text-amber-700 dark:text-yellow-200' : 'text-text',
            )}>
              {profile.username}
            </h2>
            {isAdmin && <PresidentBadge />}
          </div>

          {/* Title chosen by the user (italic, accent colour) */}
          {profile.title && (
            <p className="text-xs italic text-accent font-semibold truncate mt-0.5">
              {profile.title.name}
            </p>
          )}

          {ap && (
            <p className="text-xs-s font-medium mt-0.5 text-amber-700/80 dark:text-yellow-500/80">{ap.role}</p>
          )}
          {!ap && profile.leagueCount > 0 && (
            <p className="text-xs text-muted mt-0.5">
              👥 {profile.leagueCount} liga{profile.leagueCount !== 1 ? 's' : ''}
              {profile.stats.totalPredictions > 0 && (
                <> · 🎯 {profile.stats.totalPredictions} pronósticos</>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Level progress card (non-admin only — admin uses gold theme) */}
      {!isAdmin && (
        <div className="px-4">
          <UserLevelCard level={levelInfo} />
        </div>
      )}

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
        <h3 className="text-sm font-display font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-accent" /> Estadísticas
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={<Star size={16} />}
            label="Puntos"
            value={profile.stats.totalPoints}
            accentClass="text-amber-400"
            reduced={reduced}
          />
          <StatCard
            icon={<Crosshair size={16} />}
            label="Exactos"
            value={profile.stats.exactScores}
            accentClass="text-emerald-400"
            reduced={reduced}
          />
          <StatCard
            icon={<ClipboardList size={16} />}
            label="Jugados"
            value={profile.stats.totalPredictions}
            accentClass="text-sky-400"
            reduced={reduced}
          />
        </div>
        {/* Precisión + resultados acertados — info extra que valía la pena
            mostrar y que antes estaba oculta detrás del scroll del perfil
            con stats en 0. Ahora siempre visible. */}
        {profile.stats.totalPredictions > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StatCard
              icon={<Target size={16} />}
              label="Aciertos"
              // Aciertos = todos los pronósticos que sumaron puntos
              // (exactos + ganador correcto sin marcador exacto). Antes solo
              // contaba los parciales, lo que producía "0 aciertos · 100%
              // precisión" cuando todos los aciertos eran exactos.
              value={profile.stats.exactScores + profile.stats.correctResults}
              accentClass="text-violet-400"
              reduced={reduced}
            />
            <StatCard
              icon={<span className="text-xs">%</span>}
              label="Precisión"
              value={`${accuracy}%`}
              accentClass="text-fuchsia-400"
              reduced={reduced}
            />
          </div>
        )}
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

      {/* ── Pronósticos ────────────────────────────────────────────────
            Solo partidos ya arrancados (el gate vive en el backend). El
            admin (cuenta FIFA) no pronostica, así que mostrará el estado
            vacío — aceptable. */}
      <PredictionHistorySection userId={profile.id} reduced={reduced} />

      {/* ── Achievements ───────────────────────────────────────────────── */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-display font-bold text-muted uppercase tracking-wider flex items-center gap-2">
            <Star size={14} className="text-accent" /> Logros
            {profile.achievements.length > 0 && (
              <span className="text-text font-black">· {profile.achievements.length}</span>
            )}
          </h3>
          {!isAdmin && (
            <UserLevelBadge level={levelInfo} />
          )}
        </div>
        {profile.achievements.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2">
            <span className="text-3xl opacity-40">🏅</span>
            <p className="text-sm-s text-muted text-center">Todavía sin logros</p>
            <p className="text-xs-s text-muted/70 text-center">Hacé pronósticos y unite a ligas para empezar</p>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            variants={staggerContainer(reduced)}
            initial="initial"
            animate="animate"
          >
            {profile.achievements.map((a) => {
              const isPresidentBadge = a.slug === 'presidente_fifa';
              return (
                <motion.button
                  key={a.slug}
                  type="button"
                  onClick={() =>
                    setSelectedCard({
                      achievement: a as Achievement,
                      earned: true,
                      earnedAt: a.earnedAt,
                    })
                  }
                  variants={staggerItem(reduced)}
                  className={cn(
                    'relative overflow-hidden p-3 rounded-xl border flex items-center gap-3 transition-transform text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    !reduced && 'hover:-translate-y-0.5',
                    isPresidentBadge
                      ? 'bg-gradient-to-r from-amber-100 to-yellow-50 border-amber-400/60 dark:from-yellow-500/10 dark:to-amber-600/5 dark:border-yellow-500/30'
                      : 'bg-card border-border',
                  )}
                >
                  {/* Tier-coloured glow behind the icon to give the card
                      visual depth and quick at-a-glance rarity sense. */}
                  {!isPresidentBadge && (
                    <div
                      className={cn(
                        'absolute -left-2 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full blur-2xl opacity-30 pointer-events-none',
                        a.tier === 'platinum' && 'bg-cyan-400',
                        a.tier === 'gold' && 'bg-yellow-400',
                        a.tier === 'silver' && 'bg-slate-300',
                        a.tier === 'bronze' && 'bg-amber-600',
                      )}
                    />
                  )}
                  <span className="relative text-2xl-s">{a.icon}</span>
                  <div className="relative flex-1 min-w-0">
                    <p className={cn(
                      'text-sm-s font-bold',
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
                      'relative inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 uppercase tracking-wider',
                      isPresidentBadge
                        ? 'bg-yellow-400/40 text-amber-800 border-amber-500/60 dark:bg-yellow-400/20 dark:text-yellow-300 dark:border-yellow-400/40'
                        : (TIER_COLORS[a.tier] ?? 'bg-elevated text-muted border-border'),
                    )}
                  >
                    {isPresidentBadge ? '🏛️ FIFA' : a.tier}
                  </span>
                </motion.button>
              );
            })}
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
