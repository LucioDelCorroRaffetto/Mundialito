import { Logo } from '@/shared/components/logo';

type Props = {
  title: string;
  description?: string;
};

export function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={80} />
      <h1 className="text-2xl-s font-display font-bold text-text">{title}</h1>
      <p className="text-sm-s text-muted max-w-xs">
        {description ?? 'Esta pantalla se construye en la próxima sesión.'}
      </p>
    </div>
  );
}
