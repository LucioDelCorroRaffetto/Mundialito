import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

const COLORS = ['var(--accent)', 'var(--wc26-mex)', 'var(--wc26-usa)', 'var(--wc26-can)'];

/** Posiciones/ángulos determinísticos (no Math.random en cada render) —
 *  generados una sola vez por instancia vía useMemo. */
function makeParticles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15);
    const distance = 70 + ((i * 37) % 70); // 70–140px
    const size = 4 + ((i * 13) % 5); // 4–8px
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size,
      rotate: (i % 2 === 0 ? 1 : -1) * (180 + (i * 29) % 180),
      color: COLORS[i % COLORS.length],
      radius: i % 3 === 0 ? '50%' : '2px',
      delay: (i % 5) * 0.015,
    };
  });
}

/**
 * Confetti casero (framer-motion, sin librería) — ~24 partículas que
 * explotan desde el centro y se desvanecen. Se desmonta solo vía `onDone`.
 * Solo anima transform/opacity (sin layout/width/height, sin jank).
 */
export function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const particles = useMemo(() => makeParticles(24), []);

  useEffect(() => {
    const timer = setTimeout(onDone, 1400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-1/2 left-1/2"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.radius,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 1.2, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
