import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Globe, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { LeagueBannerPicker } from '@/shared/components/ui/image-picker';
import { cn } from '@/shared/lib/cn';
import { useCreateLeague } from '@/shared/hooks/use-leagues';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(60, 'Máximo 60 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export function LeagueCreatePage() {
  const navigate = useNavigate();
  const [isPublic, setIsPublic] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [predictionsVisibility, setPredictionsVisibility] =
    useState<'after_kickoff' | 'always'>('after_kickoff');
  const createLeague = useCreateLeague();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const league = await createLeague.mutateAsync({
        name: data.name,
        isPublic,
        imageUrl,
        predictionsVisibility,
      });
      toast.success('¡Liga creada!');
      navigate(`/leagues/${league.id}`, { replace: true });
    } catch {
      toast.error('No se pudo crear la liga');
    }
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-xl font-display font-bold text-text">Crear liga</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 px-4">

        {/* League banner image */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">Imagen de la liga <span className="text-muted font-normal">(opcional)</span></p>
          <LeagueBannerPicker value={imageUrl} onChange={setImageUrl} />
        </div>

        <Input
          label="Nombre de la liga"
          placeholder="Ej: Asado de los pibes"
          {...register('name')}
          error={errors.name?.message}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">Visibilidad</p>
          <div className="flex gap-3">
            {[
              { value: false, label: 'Privada', Icon: Lock, desc: 'Solo con código o invitación' },
              { value: true, label: 'Pública', Icon: Globe, desc: 'Aparece en el buscador' },
            ].map(({ value, label, Icon, desc }) => (
              <button
                key={label}
                type="button"
                onClick={() => setIsPublic(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  isPublic === value ? 'bg-accent-soft border-accent text-accent' : 'bg-card border-border text-muted'
                )}
              >
                <Icon size={20} />
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-center leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">Pronósticos visibles</p>
          <div className="flex gap-3">
            {([
              {
                value: 'after_kickoff' as const,
                label: 'Al inicio del partido',
                Icon: EyeOff,
                desc: 'Se ocultan hasta el kickoff',
              },
              {
                value: 'always' as const,
                label: 'Siempre',
                Icon: Eye,
                desc: 'Todos ven todo, en cualquier momento',
              },
            ]).map(({ value, label, Icon, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPredictionsVisibility(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  predictionsVisibility === value
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'bg-card border-border text-muted',
                )}
              >
                <Icon size={20} />
                <span className="text-sm font-semibold text-center">{label}</span>
                <span className="text-xs text-center leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-elevated border border-border">
          <p className="text-sm font-semibold text-text mb-1">¿Cómo funciona?</p>
          <ul className="flex flex-col gap-1">
            {[
              'Invitá amigos con el código de liga',
              'Todos pronostican antes del partido',
              'Se suman puntos al finalizar cada match',
              'Ganá el que más puntos acumule en el torneo',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span className="text-sm text-muted">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <Button type="submit" size="lg" fullWidth loading={createLeague.isPending}>
          Crear liga
        </Button>
      </form>
    </div>
  );
}
