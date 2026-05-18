import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Zap, Type } from 'lucide-react';
import { useThemeStore } from '@/theme/theme-store';
import { accentList, type AccentKey, type ThemeMode, type FontScale } from '@/theme/palettes';
import { cn } from '@/shared/lib/cn';

const MODE_OPTIONS: { value: ThemeMode; label: string; Icon: React.ElementType }[] = [
  { value: 'auto', label: 'Auto', Icon: Zap },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'light', label: 'Claro', Icon: Sun },
];

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 1.0, label: 'Normal' },
  { value: 1.15, label: 'Grande' },
  { value: 1.3, label: 'Muy grande' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { mode, accent, fontScale, setMode, setAccent, setFontScale } = useThemeStore();

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-xl-s font-display font-bold text-text">Configuración</h1>
      </div>

      <div className="flex flex-col gap-6 px-4 pb-6">
        <section className="flex flex-col gap-3">
          <p className="text-sm-s font-semibold text-text">Modo de color</p>
          <div className="flex gap-2">
            {MODE_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors',
                  mode === value ? 'bg-accent-soft border-accent text-accent' : 'bg-card border-border text-muted hover:border-accent-border'
                )}
              >
                <Icon size={18} />
                <span className="text-xs-s font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm-s font-semibold text-text">Color de acento</p>
          <div className="grid grid-cols-3 gap-2">
            {accentList.map((p) => (
              <button
                key={p.key}
                onClick={() => setAccent(p.key)}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-colors',
                  accent === p.key ? 'border-2 bg-elevated' : 'bg-card border-border hover:border-accent-border'
                )}
                style={accent === p.key ? { borderColor: p.color } : undefined}
              >
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-xs-s font-semibold text-text leading-tight truncate">{p.name}</span>
                {p.a11y && <span className="ml-auto text-xs-s text-muted flex-shrink-0" title="Accesible">♿</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Type size={16} className="text-muted" />
            <p className="text-sm-s font-semibold text-text">Tamaño de letra</p>
          </div>
          <div className="flex gap-2">
            {FONT_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFontScale(value)}
                className={cn(
                  'flex-1 py-2.5 rounded-lg border text-sm-s font-semibold transition-colors',
                  fontScale === value ? 'bg-accent-soft border-accent text-accent' : 'bg-card border-border text-muted hover:border-accent-border'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm-s text-muted mb-2">Vista previa</p>
          <p className="text-2xl-s font-display font-bold text-accent">Mundialito</p>
          <p className="text-base-s text-text mt-1">El prode de tus amigos 🏆</p>
          <p className="text-sm-s text-muted mt-0.5">Argentina 🇦🇷 2 - 1 🇧🇷 Brasil</p>
        </section>

        <button
          onClick={() => navigate('/login', { replace: true })}
          className="w-full py-3 rounded-lg border border-red-500/40 text-red-400 text-sm-s font-semibold hover:bg-red-500/10 transition-colors mt-2"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
