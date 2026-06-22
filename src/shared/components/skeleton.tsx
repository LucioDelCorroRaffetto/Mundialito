/**
 * Theme-aware skeleton placeholder. Uses the elevated surface token so the
 * base is visible in both dark mode (subtle white tint) and light mode
 * (subtle black tint), instead of vanishing on white backgrounds.
 *
 * Animación: shimmer suave (una banda de luz que barre la superficie) en vez
 * del pulse plano. Se construye con un gradiente animado vía CSS inline +
 * keyframes inyectados una sola vez, para no depender de tailwind.config.
 * Reduce-motion: el override global de `index.css`
 * (`[data-reduce-motion="true"] * { animation-duration: 0.01ms }`) neutraliza
 * el shimmer automáticamente al ser una animación CSS (queda el color base).
 */

const SHIMMER_STYLE_ID = 'skeleton-shimmer-keyframes';

// Inyecta los keyframes del shimmer una sola vez en el <head>. Idempotente y
// SSR-safe (no-op si no hay document).
function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
@keyframes skeleton-shimmer {
  0%   { background-position: -150% 0; }
  100% { background-position: 250% 0; }
}`;
  document.head.appendChild(style);
}

export function SkeletonCard({ className }: { className?: string } = {}) {
  ensureShimmerKeyframes();
  return (
    <div
      className={
        'rounded-xl h-20 w-full bg-black/10 dark:bg-white/10 ' +
        'bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.18)_50%,transparent_70%)] ' +
        'bg-[length:200%_100%] ' +
        (className ?? '')
      }
      style={{ animation: 'skeleton-shimmer 1.6s ease-in-out infinite' }}
    />
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
