import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { X, Share2, Loader2 } from 'lucide-react';
import { useWrapped } from '@/shared/hooks/use-wrapped';
import { useAuthStore } from '@/shared/stores/auth-store';
import { scaleVariants, fadeVariants, useCountUp, useMotionPrefs } from '@/shared/lib/motion';
import { renderWrappedImage, shareOrDownloadWrappedImage } from '@/shared/lib/wrapped-share-image';
import type { Wrapped } from '@/shared/types/api';

interface Slide {
  key: string;
  render: (data: Wrapped) => React.ReactNode;
}

function CountUpNumber({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <span className={className}>{display}</span>;
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full px-8 text-center">
      {children}
    </div>
  );
}

function buildSlides(data: Wrapped): Slide[] {
  const slides: Slide[] = [];

  slides.push({
    key: 'intro',
    render: () => (
      <SlideShell>
        <span className="text-6xl" aria-hidden>🏆</span>
        <h1 className="text-3xl font-extrabold text-white">Tu Mundialito Wrapped</h1>
        <p className="text-white/60 text-base">Un repaso de cómo te fue en el Mundial 2026</p>
      </SlideShell>
    ),
  });

  slides.push({
    key: 'points',
    render: (d) => (
      <SlideShell>
        <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Puntos totales</p>
        <CountUpNumber value={d.totalPoints} className="text-7xl font-extrabold text-[var(--accent)]" />
        {d.globalRank != null && (
          <p className="text-white/70 text-lg">Puesto <span className="font-bold text-white">#{d.globalRank}</span> a nivel global</p>
        )}
      </SlideShell>
    ),
  });

  if (data.totalPredictions > 0) {
    slides.push({
      key: 'accuracy',
      render: (d) => (
        <SlideShell>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Precisión</p>
          <div className="flex items-baseline gap-1">
            <CountUpNumber value={d.exactCount} className="text-7xl font-extrabold text-[var(--accent)]" />
            <span className="text-2xl text-white/50">exactos</span>
          </div>
          <p className="text-white/70 text-lg">
            de {d.totalPredictions} pronósticos ({d.accuracy}% de aciertos exactos)
          </p>
          <p className="text-white/50 text-sm">{d.correctCount} acertados sin ser exactos</p>
        </SlideShell>
      ),
    });
  }

  if (data.longestStreak >= 2) {
    slides.push({
      key: 'streak',
      render: (d) => (
        <SlideShell>
          <span className="text-6xl" aria-hidden>🔥</span>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Racha más larga</p>
          <CountUpNumber value={d.longestStreak} className="text-7xl font-extrabold text-[var(--accent)]" />
          <p className="text-white/70 text-lg">aciertos seguidos</p>
        </SlideShell>
      ),
    });
  }

  if (data.bestHit) {
    slides.push({
      key: 'best-hit',
      render: (d) => {
        const hit = d.bestHit!;
        return (
          <SlideShell>
            <span className="text-6xl" aria-hidden>🎯</span>
            <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tu pronóstico más difícil</p>
            <p className="text-3xl font-extrabold text-white">
              {hit.homeTeam?.flag ?? '🏳️'} {hit.homeScore}-{hit.awayScore} {hit.awayTeam?.flag ?? '🏳️'}
            </p>
            <p className="text-white/70 text-base">
              {hit.homeTeam?.name ?? 'Equipo'} vs {hit.awayTeam?.name ?? 'Equipo'}
            </p>
            <p className="text-white/50 text-sm">Lo clavaste exacto — casi nadie lo predijo así</p>
          </SlideShell>
        );
      },
    });
  }

  if (data.nearestRival) {
    slides.push({
      key: 'rival',
      render: (d) => (
        <SlideShell>
          <span className="text-6xl" aria-hidden>⚔️</span>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tu rival más cercano</p>
          <p className="text-white/70 text-lg">
            Te sacó apenas <span className="font-bold text-white">{Math.abs(d.nearestRival!.points - d.totalPoints)} puntos</span> de diferencia
          </p>
        </SlideShell>
      ),
    });
  }

  if (data.mostPredictedTeam) {
    slides.push({
      key: 'most-predicted',
      render: (d) => (
        <SlideShell>
          <span className="text-6xl" aria-hidden>{d.mostPredictedTeam!.flag}</span>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tu equipo favorito</p>
          <p className="text-3xl font-extrabold text-white">{d.mostPredictedTeam!.name}</p>
          <p className="text-white/50 text-sm">el que más pronosticaste como ganador</p>
        </SlideShell>
      ),
    });
  }

  if (data.championPick) {
    slides.push({
      key: 'champion-pick',
      render: (d) => {
        const pick = d.championPick!;
        return (
          <SlideShell>
            <span className="text-6xl" aria-hidden>{pick.flag}</span>
            <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tu campeón elegido</p>
            <p className="text-3xl font-extrabold text-white">{pick.name}</p>
            <p className={`text-lg font-semibold ${pick.correct ? 'text-emerald-400' : 'text-white/60'}`}>
              {pick.correct ? '¡Y acertaste! 🎉' : 'No salió esta vez'}
            </p>
          </SlideShell>
        );
      },
    });
  }

  if (data.fantasy) {
    slides.push({
      key: 'fantasy',
      render: (d) => (
        <SlideShell>
          <span className="text-6xl" aria-hidden>⭐</span>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tu equipo fantasy</p>
          <CountUpNumber value={d.fantasy!.points} className="text-7xl font-extrabold text-[var(--accent)]" />
          <p className="text-white/70 text-lg">Puesto #{d.fantasy!.rank}</p>
        </SlideShell>
      ),
    });
  }

  if (data.topAchievements.length > 0) {
    slides.push({
      key: 'achievements',
      render: (d) => (
        <SlideShell>
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold">Tus logros destacados</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {d.topAchievements.map((a) => (
              <div key={a.slug} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-2xl" aria-hidden>{a.icon}</span>
                <span className="text-white font-semibold text-left flex-1">{a.name}</span>
                <span className="text-[var(--accent)] font-bold text-sm">+{a.xpReward} XP</span>
              </div>
            ))}
          </div>
        </SlideShell>
      ),
    });
  }

  slides.push({
    key: 'closing',
    render: (d) => (
      <SlideShell>
        <span className="text-6xl" aria-hidden>🎉</span>
        <h2 className="text-2xl font-extrabold text-white">¡Nos vemos en el próximo Mundial!</h2>
        <p className="text-white/60 text-base">
          Nivel {d.level} · {d.xp} XP acumulados
        </p>
        <p className="text-white/50 text-sm">Compartí tu resumen con tus amigos</p>
      </SlideShell>
    ),
  });

  return slides;
}

export function WrappedPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  const preview = searchParams.get('preview') === '1' && !!isAdmin;
  const { data, isLoading, notReady } = useWrapped({ preview });
  const { reduced } = useMotionPrefs();

  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  const slides = useMemo(() => (data ? buildSlides(data) : []), [data]);
  const total = slides.length;

  function goTo(next: number) {
    if (next < 0) return;
    if (next >= total) {
      navigate('/home');
      return;
    }
    setIndex(next);
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX - left > width / 2;
    goTo(isRightHalf ? index + 1 : index - 1);
  }

  function handleDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.x < -80) goTo(index + 1);
    else if (info.offset.x > 80) goTo(index - 1);
  }

  async function handleShare() {
    if (!data || sharing) return;
    setSharing(true);
    try {
      const blob = await renderWrappedImage(data);
      await shareOrDownloadWrappedImage(blob);
    } catch (err) {
      console.error('[wrapped] share failed', err);
    } finally {
      setSharing(false);
    }
  }

  const variants = reduced ? fadeVariants(true) : scaleVariants(false);
  const isClosing = index === total - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#0a0e1a' }}>
      {/* Barra de progreso segmentada */}
      {total > 0 && (
        <div className="flex gap-1.5 px-3 pt-3 safe-top flex-shrink-0">
          {slides.map((s, i) => (
            <div key={s.key} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white transition-transform duration-150"
                style={{ transformOrigin: 'left', transform: `scaleX(${i <= index ? 1 : 0})` }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Botón cerrar */}
      <button
        onClick={() => navigate('/home')}
        className="absolute top-6 right-3 z-10 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-white/80"
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>

      <div className="flex-1 relative overflow-hidden" onClick={total > 0 ? handleTap : undefined}>
        {isLoading && (
          <SlideShell>
            <Loader2 size={32} className="animate-spin text-white/60" />
          </SlideShell>
        )}

        {notReady && (
          <SlideShell>
            <span className="text-6xl" aria-hidden>⏳</span>
            <h2 className="text-2xl font-bold text-white">Todavía no está listo</h2>
            <p className="text-white/60 text-base">Tu Wrapped se abre cuando termine el Mundial</p>
          </SlideShell>
        )}

        {data && total > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={slides[index].key}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              drag={reduced ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="absolute inset-0"
            >
              {slides[index].render(data)}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {isClosing && data && (
        <div className="flex-shrink-0 px-8 pb-8 safe-bottom">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleShare();
            }}
            disabled={sharing}
            className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 font-bold text-black disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {sharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
            {sharing ? 'Generando imagen…' : 'Compartir'}
          </button>
        </div>
      )}
    </div>
  );
}
