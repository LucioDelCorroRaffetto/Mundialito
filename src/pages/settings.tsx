import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Zap, Type, Bell, BellOff, Pencil, Check, X, Send } from 'lucide-react';
import { useThemeStore } from '@/theme/theme-store';
import { play } from '@/shared/lib/sounds';
import { useAuthStore } from '@/shared/stores/auth-store';
import { accentList, type ThemeMode } from '@/theme/palettes';
import { usePushNotifications } from '@/shared/hooks/use-push';
import { apiClient } from '@/shared/lib/api-client';
import { useUpdateUsername, useUpdateAvatar, useDeleteAccount } from '@/shared/hooks/use-auth';
import { useAdminProfile } from '@/shared/hooks/use-user-profile';
import { Link } from 'react-router-dom';
import { AvatarPicker } from '@/shared/components/ui/image-picker';
import { toast } from 'sonner';

type FontScale = 1.0 | 1.15 | 1.3 | 1.5 | 1.75;
import { cn } from '@/shared/lib/cn';

const MODE_OPTIONS: { value: ThemeMode; label: string; Icon: React.ElementType }[] = [
  { value: 'auto', label: 'Auto', Icon: Zap },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'light', label: 'Claro', Icon: Sun },
];

// 5 levels so the slider feels like the OS accessibility settings most
// older users already know (iOS/Android both expose 5 sizes).
const FONT_OPTIONS: { value: FontScale; label: string; sample: string }[] = [
  { value: 1.0,  label: 'Normal',       sample: 'Aa' },
  { value: 1.15, label: 'Grande',       sample: 'Aa' },
  { value: 1.3,  label: 'Muy grande',   sample: 'Aa' },
  { value: 1.5,  label: 'Extra grande', sample: 'Aa' },
  { value: 1.75, label: 'Enorme',       sample: 'Aa' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { mode, accent, fontScale, soundEnabled, setMode, setAccent, setFontScale, setSoundEnabled } = useThemeStore();
  const { logout } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const { isSubscribed, isLoading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const updateUsername = useUpdateUsername();
  const updateAvatar = useUpdateAvatar();
  const deleteAccount = useDeleteAccount();
  const { data: adminPointer } = useAdminProfile();
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount.mutateAsync(deleteConfirm.trim());
      // Wipe local auth state + persisted refresh token before navigating
      // so the next render doesn't fire authed queries with a now-invalid
      // session.
      localStorage.removeItem('mundialito_refresh');
      logout();
      toast.success('Cuenta eliminada. Te vamos a extrañar 🥲');
      navigate('/login', { replace: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err?.response?.data?.error?.message ?? 'No se pudo eliminar la cuenta');
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const { data } = await apiClient.post<{
        data: { devices: number; sent: number; failed: number; removed: number };
      }>('/push/test');
      const { sent, failed, removed, devices } = data.data;
      if (sent > 0) {
        toast.success(
          devices === 1
            ? 'Notificación enviada — debería aparecerte en unos segundos'
            : `Enviada a ${sent} de ${devices} dispositivo(s)`,
        );
      } else if (removed > 0) {
        toast.error(
          'La suscripción quedó vieja. Tocá "Activar notificaciones" para refrescarla.',
        );
      } else if (failed > 0) {
        toast.error('No se pudo enviar a ninguno de tus dispositivos');
      }
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'NO_SUBSCRIPTION') {
        toast.error('Primero activá notificaciones arriba');
      } else {
        toast.error('Falló el envío de prueba');
      }
    } finally {
      setSendingTest(false);
    }
  };

  const handleAvatarChange = async (newUrl: string | null) => {
    try {
      await updateAvatar.mutateAsync(newUrl);
      toast.success(newUrl ? 'Foto actualizada' : 'Foto eliminada');
    } catch {
      toast.error('No se pudo guardar la foto');
    }
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-xl-s font-display font-bold text-text">Configuración</h1>
      </div>

      <div className="flex flex-col gap-6 px-4 pb-6">

        {/* Font scale — lifted to the very top of Settings so the first
            thing an older user sees here is 'make this bigger'. The
            section is duplicated higher up; the original lower position
            is removed in the same patch. */}
        <section className="flex flex-col gap-3 p-4 rounded-xl bg-accent-soft border border-accent-border">
          <div className="flex items-center gap-2">
            <Type size={18} className="text-accent" />
            <p className="text-base-s font-semibold text-text">Tamaño de letra</p>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {FONT_OPTIONS.map(({ value, label, sample }) => (
              <button
                key={value}
                onClick={() => setFontScale(value)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-lg border transition-colors min-h-[68px]',
                  fontScale === value
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-card border-border text-muted hover:border-accent-border',
                )}
                aria-pressed={fontScale === value}
              >
                <span
                  className="font-bold leading-none"
                  style={{ fontSize: `${value * 0.875}rem` }}
                >
                  {sample}
                </span>
                <span className="text-[10px] font-semibold leading-tight text-center">
                  {label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs-s text-muted leading-snug">
            Hace todo más grande de un toque. También podés pellizcar
            con dos dedos en cualquier pantalla para hacer zoom.
          </p>
        </section>

        {/* Avatar */}
        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-text">Foto de perfil</p>
          <div className="flex items-center gap-4">
            <AvatarPicker
              value={user?.avatarUrl ?? null}
              onChange={handleAvatarChange}
              size={80}
              fallback={(user?.username?.[0] ?? '?').toUpperCase()}
              disabled={updateAvatar.isPending}
            />
            <div className="flex-1">
              <p className="text-sm text-text font-semibold">@{user?.username ?? '—'}</p>
              <p className="text-xs text-muted mt-0.5">
                Tocá la imagen para cambiarla.<br />
                Se recorta automáticamente a 300 px.
              </p>
            </div>
          </div>
        </section>

        {/* Username */}
        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-text">Nombre de usuario</p>
          {editingUsername ? (
            <div className="flex items-center gap-2">
              <input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="ej: lucho_2026"
                maxLength={30}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-elevated text-text text-sm focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                onClick={async () => {
                  try {
                    await updateUsername.mutateAsync(usernameInput.trim());
                    toast.success('¡Nombre actualizado!');
                    setEditingUsername(false);
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { error?: { message?: string } } } };
                    toast.error(err?.response?.data?.error?.message ?? 'No se pudo actualizar');
                  }
                }}
                disabled={updateUsername.isPending || usernameInput.trim().length < 3}
                className="p-2 rounded-lg bg-accent text-accent-on disabled:opacity-50"
                aria-label="Guardar nombre de usuario"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => setEditingUsername(false)}
                className="p-2 rounded-lg bg-elevated border border-border text-muted"
                aria-label="Cancelar edición"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
              <span className="flex-1 text-sm text-text font-semibold">@{user?.username ?? '—'}</span>
              <button
                onClick={() => { setUsernameInput(user?.username ?? ''); setEditingUsername(true); }}
                className="flex items-center gap-1.5 text-xs text-accent font-semibold"
              >
                <Pencil size={13} />
                Cambiar
              </button>
            </div>
          )}
          <p className="text-xs text-muted -mt-1">Solo letras, números y guión bajo. Mínimo 3 caracteres.</p>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-text">Modo de color</p>
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

        {/* Font scale already rendered at the top — duplicated section removed. */}

        <section className="flex flex-col gap-3">
          <p className="text-sm-s font-semibold text-text">Sonidos</p>
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              // Feedback inmediato: si lo está prendiendo, que escuche cómo suena.
              if (!soundEnabled) setTimeout(() => play('goal'), 50);
            }}
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border transition-colors text-left',
              soundEnabled ? 'bg-accent-soft border-accent-border' : 'bg-card border-border hover:border-accent-border',
            )}
          >
            <span className="text-xl">{soundEnabled ? '🔊' : '🔇'}</span>
            <div className="flex-1">
              <p className="text-base-s font-semibold text-text">
                {soundEnabled ? 'Sonidos activados' : 'Sonidos desactivados'}
              </p>
              <p className="text-sm-s text-muted">
                Gol al guardar pronóstico · fanfarria en logros
              </p>
            </div>
            <span
              className={cn(
                'w-10 h-6 rounded-full relative transition-colors flex-shrink-0',
                soundEnabled ? 'bg-accent' : 'bg-elevated border border-border',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                  soundEnabled ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-text">Notificaciones</p>
          <button
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={pushLoading || !('serviceWorker' in navigator) || !('PushManager' in window)}
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border transition-colors text-left',
              isSubscribed
                ? 'bg-accent-soft border-accent'
                : 'bg-card border-border hover:border-accent-border'
            )}
          >
            <div className="w-9 h-9 rounded-md bg-elevated flex items-center justify-center flex-shrink-0">
              {pushLoading ? (
                <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : isSubscribed ? (
                <Bell size={18} className="text-accent" />
              ) : (
                <BellOff size={18} className="text-muted" />
              )}
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-semibold', isSubscribed ? 'text-accent' : 'text-text')}>
                {isSubscribed ? '¡Notificaciones activas!' : 'Activar notificaciones'}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {pushLoading
                  ? 'Configurando...'
                  : isSubscribed
                  ? 'Tocá para desactivar'
                  : 'Te avisamos 30 min antes del cierre de pronósticos'}
              </p>
            </div>
            {/* Toggle visual */}
            <div className={cn(
              'w-11 h-6 rounded-full transition-colors flex-shrink-0',
              isSubscribed ? 'bg-accent' : 'bg-elevated border border-border'
            )}>
              <div className={cn(
                'w-5 h-5 rounded-full bg-white shadow-sm mt-0.5 transition-transform',
                isSubscribed ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </div>
          </button>

          {/* Test button — only when subscribed. Helps users verify their
              device actually receives pushes before the cron has anything
              real to send (i.e. before the tournament starts). */}
          {isSubscribed && (
            <button
              onClick={handleSendTest}
              disabled={sendingTest}
              className="flex items-center gap-2 self-start px-3 py-1.5 rounded-md bg-elevated border border-border text-xs-s font-semibold text-muted hover:text-text hover:border-accent-border transition-colors disabled:opacity-50"
            >
              {sendingTest ? (
                <span className="w-3 h-3 border-2 border-muted border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={12} />
              )}
              {sendingTest ? 'Enviando…' : 'Enviar prueba a este dispositivo'}
            </button>
          )}

          <p className="text-xs-s text-muted/80 leading-snug -mt-1">
            Los avisos reales empiezan a llegar <span className="text-text font-semibold">30 min antes de cada partido</span> del Mundial.
            Antes del 11/6 podés mandarte una prueba para verificar que tu celular las recibe.
          </p>
        </section>

        <section className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm-s text-muted mb-2">Vista previa</p>
          <p className="text-2xl-s font-display font-bold text-accent">Mundialito</p>
          <p className="text-base-s text-text mt-1">El prode de tus amigos 🏆</p>
          <p className="text-sm-s text-muted mt-0.5">Argentina 🇦🇷 2 - 1 🇧🇷 Brasil</p>
        </section>

        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="w-full py-3 rounded-lg border border-red-500/40 text-red-400 text-sm-s font-semibold hover:bg-red-500/10 transition-colors mt-2"
        >
          Cerrar sesión
        </button>

        {/* Account deletion — kept visually quieter than logout and behind
            a confirm-by-typing-username modal so it's hard to trigger by
            accident. Permanent: ligas heredan admin al miembro más
            antiguo; predictions, fantasy, logros, etc. se borran. */}
        <section className="mt-6 pt-6 border-t border-border">
          <p className="text-xs-s font-semibold text-muted uppercase tracking-wider mb-2">Zona peligrosa</p>
          <button
            onClick={() => { setDeleteConfirm(''); setDeleteOpen(true); }}
            className="w-full text-left py-3 px-4 rounded-lg bg-card border border-border hover:border-red-500/40 transition-colors"
          >
            <p className="text-sm-s font-semibold text-red-400">Eliminar cuenta</p>
            <p className="text-xs-s text-muted mt-0.5">
              Borrá tu cuenta y todos tus datos para siempre.
            </p>
          </button>
        </section>

        {deleteOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleteAccount.isPending) setDeleteOpen(false);
            }}
          >
            <div className="w-full max-w-md rounded-xl bg-card border border-border p-5 shadow-xl">
              <p className="text-base-s font-display font-bold text-red-400">Eliminar cuenta</p>
              <p className="text-sm-s text-text mt-2">
                Esta acción es <span className="font-semibold">permanente</span>.
                Se borran tus pronósticos, fantasy, logros y notificaciones.
              </p>
              <p className="text-xs-s text-muted mt-2 leading-snug">
                Las ligas que administrás se transfieren al miembro más antiguo. Si sos el único miembro, la liga también se borra.
              </p>
              <label className="block mt-4 text-xs-s text-muted">
                Para confirmar, escribí{' '}
                <span className="font-mono text-text">{user?.username}</span>:
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                disabled={deleteAccount.isPending}
                autoFocus
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-elevated text-text text-sm focus:outline-none focus:border-red-400"
              />
              <div className="mt-5 flex items-center gap-2 justify-end">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleteAccount.isPending}
                  className="px-3 py-2 rounded-lg bg-elevated border border-border text-text text-sm-s font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={
                    deleteAccount.isPending ||
                    deleteConfirm.trim().toLowerCase() !== (user?.username ?? '').toLowerCase()
                  }
                  className="px-3 py-2 rounded-lg bg-red-500 text-white text-sm-s font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteAccount.isPending ? 'Eliminando…' : 'Eliminar cuenta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Author credit — untouched layout. The 🏛️ in front of "Mundialito
            2026" doubles as a discreet shortcut to the Presidente's profile
            for anyone curious. Same line, same rhythm; the credit stays the
            star. */}
        <div className="flex flex-col items-center gap-1.5 pt-2 pb-1">
          <p className="text-xs-s text-muted/50">
            {adminPointer && adminPointer.id !== user?.id ? (
              <Link
                to={`/u/${adminPointer.id}`}
                aria-label="Perfil del Presidente FIFA"
                className="hover:text-accent transition-colors"
              >
                🏛️
              </Link>
            ) : (
              '⚽'
            )}{' '}
            Mundialito 2026 · Hecho con ❤️ por
          </p>
          <p className="text-xs-s text-muted/70 font-medium">Lucio Del Corro Raffetto</p>
          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com/in/luciodelcorroraffetto/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs-s text-muted/50 hover:text-accent transition-colors"
            >
              LinkedIn
            </a>
            <span className="text-muted/30 text-xs-s">·</span>
            <a
              href="https://github.com/LucioDelCorroRaffetto/Mundialito"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs-s text-muted/50 hover:text-accent transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
