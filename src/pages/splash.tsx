import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/shared/components/logo';
import { useAuthStore } from '@/shared/stores/auth-store';

/**
 * Splash de apertura estilo "ceremonia inaugural" WC26:
 *   1. Banda de luz tri-anfitrión (verde/azul/rojo) barre la pantalla.
 *   2. El emblema "26" aparece con un spring + gradiente tri-color.
 *   3. El logo y el tagline se revelan debajo.
 * Dura ~1.8s y navega solo. El sweep es CSS (lo apaga el kill-switch de
 * reduced-motion); los springs son framer con duraciones cortas.
 */
export function SplashPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const destination = isAuthenticated ? '/home' : '/login';
    const t = setTimeout(() => navigate(destination, { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [navigate, isAuthenticated]);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center gap-5 bg-bg text-text p-6 overflow-hidden">
      {/* Banda de luz tri-color que cruza la pantalla una sola vez */}
      <div
        aria-hidden
        className="wc26-sweep absolute inset-y-0 w-1/2 opacity-25 pointer-events-none"
        style={{ background: 'var(--wc26-gradient)', filter: 'blur(40px)' }}
      />

      {/* Emblema "26" — tipografía Russo One (la del logo), gradiente tri-host */}
      <motion.div
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.1 }}
        className="relative leading-none select-none"
      >
        <span className="wc26-gradient-text font-logo text-[7rem] leading-none">26</span>
        <motion.span
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.35 }}
          className="absolute -top-3 -right-7 text-4xl"
          aria-hidden
        >
          🏆
        </motion.span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
      >
        <Logo size={120} />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.7, y: 0 }}
        transition={{ delay: 0.75, duration: 0.4 }}
        className="font-display font-bold text-sm-s tracking-[0.3em] uppercase wc26-gradient-text"
      >
        El prode de tus amigos
      </motion.p>

      {/* Piso: barra tri-color, guiño a las 3 sedes */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.6, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="wc26-stripe absolute bottom-0 inset-x-0 origin-left"
      />
    </div>
  );
}
