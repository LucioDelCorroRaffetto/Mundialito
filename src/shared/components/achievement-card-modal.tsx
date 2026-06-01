import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { Achievement, AchievementTier } from '@/shared/hooks/use-achievements';

interface Props {
  achievement: Achievement | null;
  earned: boolean;
  earnedAt?: string;
  onClose: () => void;
}

/**
 * Pokémon-card-style modal for an achievement. Visual treatment scales with
 * tier:
 *   - bronze:   matte brown finish, subtle warm reflection.
 *   - silver:   metallic gradient + faint holographic sweep on tilt.
 *   - gold:     foil sheen + warm radial glow.
 *   - platinum: full rainbow holographic, animated conic gradient + intense
 *               glow + sparkle dots.
 *
 * The card responds to pointer movement: a 3D tilt + a parallax light streak
 * that follows the cursor. Locked achievements show the same tier finish
 * but greyed out with a lock badge.
 */
export function AchievementCardModal({ achievement, earned, earnedAt, onClose }: Props) {
  // Close on Escape + lock body scroll while open. Without the body lock,
  // scrolling on the underlying page bleeds through the backdrop on mobile
  // (especially Safari which doesn't respect the dialog scroll containment).
  useEffect(() => {
    if (!achievement) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [achievement, onClose]);

  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20"
          >
            <X size={16} />
          </motion.button>

          <div onClick={(e) => e.stopPropagation()}>
            <AchievementCard
              achievement={achievement}
              earned={earned}
              earnedAt={earnedAt}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  platinum: 'Platino',
};

function AchievementCard({
  achievement,
  earned,
  earnedAt,
}: {
  achievement: Achievement;
  earned: boolean;
  earnedAt?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Normalised pointer position relative to the card (0..1 on each axis).
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5, active: false });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPointer({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      active: true,
    });
  }
  function onLeave() {
    setPointer({ x: 0.5, y: 0.5, active: false });
  }

  const tier = achievement.tier;
  const rotX = pointer.active ? (0.5 - pointer.y) * 12 : 0;
  const rotY = pointer.active ? (pointer.x - 0.5) * 14 : 0;

  // Tier-specific surface treatment.
  const surface = SURFACES[tier];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="select-none"
      style={{ perspective: 1000 }}
    >
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        animate={{ rotateX: rotX, rotateY: rotY }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{
          width: 280,
          aspectRatio: '3 / 4',
          transformStyle: 'preserve-3d',
        }}
        className={cn(
          'relative rounded-2xl overflow-hidden border shadow-2xl',
          surface.frame,
          !earned && 'opacity-90',
        )}
      >
        {/* Base tier gradient */}
        <div className={cn('absolute inset-0', surface.base)} />

        {/* Universal chrome scratches — present on every tier, intensity
            scales with rarity. Gives the metallic "trading card" feel. */}
        <ChromeScratches intensity={TIER_INTENSITY[tier]} dimmed={!earned} />

        {/* Universal cursor-driven rainbow refraction. Stronger on platinum
            and gold. This is the headline "Pokémon holo" effect — a
            rainbow band that follows the cursor across the card. */}
        <RainbowRefraction
          pointer={pointer}
          intensity={TIER_INTENSITY[tier]}
          dimmed={!earned}
        />

        {/* Tier-specific extra layers */}
        {tier === 'platinum' && <PlatinumHolo pointer={pointer} dimmed={!earned} />}
        {tier === 'gold' && <GoldFoil pointer={pointer} dimmed={!earned} />}
        {tier === 'silver' && <SilverSheen pointer={pointer} dimmed={!earned} />}
        {tier === 'bronze' && <BronzeWarmth pointer={pointer} dimmed={!earned} />}

        {/* Top-side specular highlight that tracks the cursor — fakes
            the 3D-curve light catch you get on a real foil card. */}
        <SpecularHighlight pointer={pointer} dimmed={!earned} />

        {/* Locked overlay (grayscale-ish veil) */}
        {!earned && (
          <div className="absolute inset-0 bg-black/55 backdrop-saturate-50" />
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-5 text-center">
          {/* Tier chip */}
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
                surface.tierPill,
              )}
            >
              {TIER_LABEL[tier]}
            </span>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
                earned
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : 'bg-white/5 text-white/50 border-white/15',
              )}
            >
              {earned ? '✓ Conseguido' : '🔒 Bloqueado'}
            </span>
          </div>

          {/* Icon */}
          <div className="flex-1 flex items-center justify-center my-2">
            <div className="relative">
              <span
                className={cn(
                  'block text-[88px] leading-none drop-shadow-[0_4px_20px_rgba(0,0,0,0.55)]',
                  !earned && 'grayscale opacity-70',
                )}
              >
                {achievement.icon}
              </span>
              {!earned && (
                <Lock
                  size={26}
                  className="absolute -bottom-2 -right-2 text-white/70 bg-black/60 rounded-full p-1"
                />
              )}
            </div>
          </div>

          {/* Title */}
          <h2
            className={cn(
              'text-lg font-display font-bold leading-tight',
              earned ? surface.title : 'text-white/80',
            )}
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
          >
            {achievement.name}
          </h2>
          <p
            className={cn(
              'text-xs leading-snug mt-1.5 mb-3',
              earned ? 'text-white/85' : 'text-white/55',
            )}
          >
            {achievement.description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/15">
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                earned ? surface.points : 'text-white/55',
              )}
            >
              +{achievement.pointsBonus} pts
            </span>
            {earned && earnedAt && (
              <span className="text-[10px] text-white/55 uppercase tracking-wider">
                {new Date(earnedAt).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Tier surface palette ────────────────────────────────────────────────────

interface Surface {
  frame: string;
  base: string;
  tierPill: string;
  title: string;
  points: string;
}

const SURFACES: Record<AchievementTier, Surface> = {
  bronze: {
    frame: 'border-amber-700/60',
    base: 'bg-gradient-to-br from-amber-900 via-amber-800 to-stone-900',
    tierPill: 'bg-amber-700/30 text-amber-200 border-amber-600/50',
    title: 'text-amber-100',
    points: 'text-amber-300',
  },
  silver: {
    frame: 'border-slate-400/60',
    base: 'bg-gradient-to-br from-slate-600 via-slate-500 to-slate-800',
    tierPill: 'bg-slate-400/25 text-slate-100 border-slate-300/50',
    title: 'text-slate-50',
    points: 'text-slate-200',
  },
  gold: {
    frame: 'border-yellow-400/70',
    base: 'bg-gradient-to-br from-yellow-600 via-amber-500 to-orange-700',
    tierPill: 'bg-yellow-400/30 text-yellow-100 border-yellow-300/60',
    title: 'text-yellow-50',
    points: 'text-yellow-100',
  },
  platinum: {
    frame: 'border-cyan-300/70',
    base: 'bg-gradient-to-br from-fuchsia-700 via-indigo-700 to-cyan-700',
    tierPill: 'bg-cyan-300/30 text-cyan-100 border-cyan-200/60',
    title: 'text-white',
    points: 'text-cyan-100',
  },
};

// ─── Holographic / sheen layers ──────────────────────────────────────────────

interface LayerProps {
  pointer: { x: number; y: number; active: boolean };
  dimmed?: boolean;
}

/** How aggressive the holographic effects render per tier. Softer than the
 *  first pass — feedback was "too harsh". 0 = matte, 1 = full holo. */
const TIER_INTENSITY: Record<AchievementTier, number> = {
  bronze: 0.25,
  silver: 0.4,
  gold: 0.6,
  platinum: 0.85,
};

/**
 * Rainbow refraction — a soft prismatic band that only reveals where the
 * cursor passes. Rest state is invisible; the rainbow only "exists" inside
 * the spotlight. This is closer to how real holo cards behave: the
 * rainbow is dormant until light hits it.
 */
function RainbowRefraction({ pointer, intensity, dimmed }: LayerProps & { intensity: number }) {
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  const baseAlpha = (dimmed ? 0.4 : 1) * intensity;
  // Spotlight strength: 0 when cursor is gone, full when over the card.
  const spotlight = pointer.active ? 1 : 0.18;

  return (
    <>
      {/* Latent rainbow band — only visible inside the spotlight. Combined
          via a single radial mask so we don't have to layer twice. The
          rainbow gradient sits underneath a circular alpha mask centered on
          the cursor; outside the mask it fades to transparent. */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-soft-light transition-opacity duration-500"
        style={{
          backgroundImage: `
            radial-gradient(
              circle 280px at ${px}% ${py}%,
              rgba(255, 255, 255, ${baseAlpha}) 0%,
              rgba(255, 255, 255, ${baseAlpha * 0.5}) 30%,
              transparent 65%
            ),
            linear-gradient(115deg,
              rgba(255, 90, 170, 0.55) 0%,
              rgba(255, 220, 100, 0.55) 20%,
              rgba(120, 255, 180, 0.55) 40%,
              rgba(90, 200, 255, 0.55) 60%,
              rgba(190, 130, 255, 0.55) 80%,
              rgba(255, 90, 170, 0.55) 100%
            )
          `,
          backgroundBlendMode: 'multiply',
          opacity: spotlight,
        }}
      />
      {/* Soft white highlight under the cursor — gives the card a glassy
          surface feel without the previous "spotlight" intensity. */}
      <div
        className="absolute inset-0 mix-blend-screen pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(
            circle 200px at ${px}% ${py}%,
            rgba(255, 255, 255, ${0.2 * baseAlpha * spotlight}),
            transparent 70%
          )`,
        }}
      />
    </>
  );
}

/**
 * Very faint diagonal scratch texture — half the opacity of the previous
 * pass, gives a hint of brushed-metal without screaming. */
function ChromeScratches({ intensity, dimmed }: { intensity: number; dimmed?: boolean }) {
  const a = (dimmed ? 0.4 : 1) * intensity * 0.08;
  return (
    <div
      className="absolute inset-0 pointer-events-none mix-blend-overlay"
      style={{
        backgroundImage: `
          repeating-linear-gradient(
            115deg,
            transparent 0,
            transparent 9px,
            rgba(255, 255, 255, ${a}) 9px,
            rgba(255, 255, 255, ${a}) 10px,
            transparent 10px,
            transparent 18px
          )
        `,
      }}
    />
  );
}

/**
 * Gentle elliptical specular highlight under the cursor. Lower alpha so
 * it reads as glassy rather than blinding.
 */
function SpecularHighlight({ pointer, dimmed }: LayerProps) {
  if (!pointer.active) return null;
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  const a = dimmed ? 0.15 : 0.35;
  return (
    <div
      className="absolute inset-0 pointer-events-none mix-blend-screen transition-opacity duration-300"
      style={{
        background: `radial-gradient(
          ellipse 180px 90px at ${px}% ${py}%,
          rgba(255, 255, 255, ${a}),
          transparent 75%
        )`,
      }}
    />
  );
}

/** Full rainbow holographic for platinum. */
function PlatinumHolo({ pointer, dimmed }: LayerProps) {
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  return (
    <>
      {/* Rotating conic — feels like a real holo at rest */}
      <motion.div
        className="absolute inset-0 mix-blend-screen pointer-events-none"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, #ff6ad5, #ffe14d, #4dffdf, #4d9bff, #c14dff, #ff6ad5)',
          opacity: dimmed ? 0.25 : 0.5,
          filter: 'blur(8px)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
      {/* Cursor-driven highlight */}
      <div
        className="absolute inset-0 mix-blend-overlay pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.5), transparent 50%)`,
          opacity: pointer.active ? 1 : 0.35,
        }}
      />
      {/* Sparkle dots */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1.5px)',
          backgroundSize: '18px 18px',
          opacity: dimmed ? 0.05 : 0.15,
        }}
      />
      {/* Outer glow */}
      <div
        className="absolute -inset-1 rounded-2xl pointer-events-none"
        style={{
          boxShadow: dimmed
            ? '0 0 18px rgba(56, 248, 248, 0.15)'
            : '0 0 36px rgba(56, 248, 248, 0.45)',
        }}
      />
    </>
  );
}

/** Warm gold foil. */
function GoldFoil({ pointer, dimmed }: LayerProps) {
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  return (
    <>
      <motion.div
        className="absolute inset-0 mix-blend-screen pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,236,140,0.35) 0%, rgba(255,191,77,0.15) 50%, rgba(255,236,140,0.35) 100%)',
          opacity: dimmed ? 0.3 : 0.7,
        }}
        animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${px}% ${py}%, rgba(255,242,150,0.55), transparent 55%)`,
          opacity: pointer.active ? 1 : 0.3,
        }}
      />
      <div
        className="absolute -inset-1 rounded-2xl pointer-events-none"
        style={{
          boxShadow: dimmed
            ? '0 0 14px rgba(255,200,80,0.12)'
            : '0 0 28px rgba(255,200,80,0.35)',
        }}
      />
    </>
  );
}

/** Subtle silver holographic sweep. */
function SilverSheen({ pointer, dimmed }: LayerProps) {
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  return (
    <>
      <div
        className="absolute inset-0 mix-blend-overlay pointer-events-none"
        style={{
          background:
            'linear-gradient(120deg, rgba(255,255,255,0.18) 0%, rgba(180,200,255,0.08) 50%, rgba(255,255,255,0.18) 100%)',
          opacity: dimmed ? 0.3 : 0.7,
        }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(ellipse at ${px}% ${py}%, rgba(255,255,255,0.5), transparent 60%)`,
          opacity: pointer.active ? 1 : 0.25,
        }}
      />
      <div
        className="absolute -inset-1 rounded-2xl pointer-events-none"
        style={{
          boxShadow: dimmed
            ? '0 0 10px rgba(200,210,230,0.1)'
            : '0 0 18px rgba(200,210,230,0.25)',
        }}
      />
    </>
  );
}

/** Matte bronze with a faint warm reflection. */
function BronzeWarmth({ pointer, dimmed }: LayerProps) {
  const px = pointer.x * 100;
  const py = pointer.y * 100;
  return (
    <>
      <div
        className="absolute inset-0 mix-blend-overlay pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${px}% ${py}%, rgba(255,200,140,0.35), transparent 50%)`,
          opacity: pointer.active ? 1 : 0.25,
        }}
      />
      <div
        className="absolute -inset-1 rounded-2xl pointer-events-none"
        style={{
          boxShadow: dimmed
            ? 'inset 0 0 12px rgba(120,60,30,0.4)'
            : 'inset 0 0 12px rgba(120,60,30,0.4), 0 0 14px rgba(180,100,50,0.18)',
        }}
      />
    </>
  );
}
