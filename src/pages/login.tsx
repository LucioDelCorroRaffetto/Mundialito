import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Logo } from '@/shared/components/logo';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (_data: FormValues) => {
    setLoading(true);
    // mock: simular llamada y entrar
    await new Promise((r) => setTimeout(r, 600));
    navigate('/home', { replace: true });
  };

  const handleGoogle = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    navigate('/home', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg text-text">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col items-center gap-8"
      >
        <div className="flex flex-col items-center gap-3">
          <Logo size={100} />
          <h1 className="text-2xl-s font-display font-bold text-accent mt-2">Bienvenido</h1>
          <p className="text-sm-s text-muted text-center">Entrá para crear o unirte a tu prode</p>
        </div>

        <Button variant="secondary" size="lg" fullWidth onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuar con Google
        </Button>

        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs-s text-muted">o con email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="vos@email.com"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            placeholder="••••••"
            {...register('password')}
            error={errors.password?.message}
          />
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Entrar
          </Button>
        </form>

        <p className="text-sm-s text-muted">
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="text-accent font-semibold hover:underline">
            Registrate
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
