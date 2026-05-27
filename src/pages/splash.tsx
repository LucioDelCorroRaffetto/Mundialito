import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/shared/components/logo';
import { useAuthStore } from '@/shared/stores/auth-store';

export function SplashPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // If the user already has a valid session (token persisted in localStorage),
    // skip the login page entirely and go straight to the app.
    const destination = isAuthenticated ? '/home' : '/login';
    const t = setTimeout(() => navigate(destination, { replace: true }), 1200);
    return () => clearTimeout(t);
  }, [navigate, isAuthenticated]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-bg text-text p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <Logo size={180} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="font-tagline font-bold text-sm-s text-accent tracking-[0.3em] uppercase"
      >
        El prode de tus amigos
      </motion.p>
    </div>
  );
}
