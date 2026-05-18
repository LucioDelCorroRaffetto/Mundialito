import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Logo } from '@/shared/components/logo';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { GoogleSignInButton } from '@/shared/components/google-sign-in-button';
import { useRegister } from '@/shared/hooks/use-auth';

const schema = z.object({
  displayName: z.string().min(2, 'Mínimo 2 caracteres').max(60, 'Máximo 60 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormValues) => {
    registerMutation.mutate(
      { username: data.displayName, email: data.email, password: data.password },
      { onSuccess: () => navigate('/home', { replace: true }) }
    );
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
          <Logo size={80} />
          <h1 className="text-2xl-s font-display font-bold text-accent mt-2">Crear cuenta</h1>
          <p className="text-sm-s text-muted text-center">Gratis · sin ads · sin pagos</p>
        </div>

        <div className="flex justify-center w-full">
          <GoogleSignInButton />
        </div>

        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs-s text-muted">o con email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-4">
          <Input
            label="¿Cómo te llamamos?"
            type="text"
            autoComplete="nickname"
            placeholder="Tu nombre o apodo"
            {...register('displayName')}
            error={errors.displayName?.message}
          />
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
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            {...register('password')}
            error={errors.password?.message}
          />
          {registerMutation.isError && (
            <p className="text-sm-s text-red-400 text-center -mt-1">
              {(registerMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Error al crear la cuenta. Intentá de nuevo.'}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={registerMutation.isPending}>
            Crear cuenta
          </Button>
        </form>

        <p className="text-sm-s text-muted">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-accent font-semibold hover:underline">
            Entrá
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
