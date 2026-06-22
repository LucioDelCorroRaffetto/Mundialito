import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, Download, Users, CheckCircle2 } from 'lucide-react';
import { usePwaInstall } from '@/shared/hooks/use-pwa-install';
import { Button } from '@/shared/components/ui/button';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';

/**
 * Guía de onboarding para gente no técnica ("el primo de mi novia"):
 *   1. Instalar la app en la pantalla de inicio (por plataforma).
 *   2. Crear cuenta.
 *   3. Crear una liga e invitar amigos por WhatsApp.
 *
 * Es una ruta PÚBLICA (fuera de RequireAuth) para que el link se pueda
 * mandar por WhatsApp a amigos que todavía no tienen cuenta.
 */

const APP_URL = 'https://mundialito-pi.vercel.app';

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

const WHATSAPP_MESSAGE = encodeURIComponent(
  `⚽ ¡Sumate al prode del Mundial 2026!\n\n` +
  `1️⃣ Entrá acá: ${APP_URL}\n` +
  `2️⃣ Creá tu cuenta (con Google es 1 toque)\n` +
  `3️⃣ Instalala en tu pantalla de inicio para tenerla como app\n\n` +
  `Después te paso el código de nuestra liga 🏆`,
);

function Step({ n, title, children, reduced }: { n: number; title: string; children: React.ReactNode; reduced: boolean }) {
  return (
    <motion.div variants={staggerItem(reduced)} className="flex gap-3 p-4 rounded-xl bg-card border border-border">
      <span className="w-8 h-8 rounded-full bg-accent text-accent-on font-display font-bold flex items-center justify-center flex-shrink-0" aria-hidden="true">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base-s font-bold text-text mb-1">
          <span className="sr-only">Paso {n}: </span>{title}
        </p>
        <div className="text-sm-s text-muted leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
}

export function HelpPage() {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, install } = usePwaInstall();
  const { reduced } = useMotionPrefs();
  const platform = detectPlatform();

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-10 max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-4 pt-5 pb-2">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md bg-elevated border border-border" aria-label="Volver">
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-xl-s font-display font-bold text-text">Cómo empezar</h1>
      </div>
      <p className="px-4 pb-4 text-sm-s text-muted">
        3 pasos para jugar el prode del Mundial con tus amigos.
      </p>

      <motion.div
        className="flex flex-col gap-3 px-4"
        variants={staggerContainer(reduced, 0.06)}
        initial="initial"
        animate="animate"
      >
        {/* ── Paso 1: instalar ─────────────────────────────────────────── */}
        <Step n={1} title="Instalá la app en tu teléfono" reduced={reduced}>
          {isInstalled ? (
            <p className="flex items-center gap-2 text-green-600 dark:text-green-300 font-semibold">
              <CheckCircle2 size={16} /> ¡Ya la tenés instalada!
            </p>
          ) : isInstallable ? (
            <>
              <p className="mb-2">Tocá el botón y confirmá — queda como una app más.</p>
              <Button onClick={install} size="sm">
                <Download size={15} className="mr-1.5" /> Instalar ahora
              </Button>
            </>
          ) : platform === 'ios' ? (
            <ol className="list-decimal ml-4 space-y-1">
              <li>Abrí esta página en <strong className="text-text">Safari</strong></li>
              <li>Tocá el botón <strong className="text-text">Compartir</strong> (el cuadradito con flecha ↑, abajo al medio)</li>
              <li>Bajá y elegí <strong className="text-text">"Agregar a inicio"</strong></li>
              <li>Tocá <strong className="text-text">Agregar</strong> — listo, te queda el ícono 🏆</li>
            </ol>
          ) : platform === 'android' ? (
            <ol className="list-decimal ml-4 space-y-1">
              <li>Abrí esta página en <strong className="text-text">Chrome</strong></li>
              <li>Tocá el menú <strong className="text-text">⋮</strong> (arriba a la derecha)</li>
              <li>Elegí <strong className="text-text">"Agregar a pantalla principal"</strong> o <strong className="text-text">"Instalar app"</strong></li>
            </ol>
          ) : (
            <p>
              En tu compu: buscá el ícono de instalar (⊕ o un monitor con flecha) en la
              barra de direcciones de Chrome/Edge. En el teléfono es donde más se disfruta.
            </p>
          )}
        </Step>

        {/* ── Paso 2: cuenta ───────────────────────────────────────────── */}
        <Step n={2} title="Creá tu cuenta" reduced={reduced}>
          <p>
            Con <strong className="text-text">Google es 1 toque</strong>, o registrate con
            email y contraseña. Ya podés dejar tus pronósticos — no hace falta liga para empezar.
          </p>
        </Step>

        {/* ── Paso 3: liga ─────────────────────────────────────────────── */}
        <Step n={3} title="Armá la liga con tus amigos" reduced={reduced}>
          <ol className="list-decimal ml-4 space-y-1 mb-3">
            <li>Andá a <strong className="text-text">Ligas → + Nueva</strong></li>
            <li>Poné un nombre (ej: "Los del asado")</li>
            <li>Compartí el <strong className="text-text">código de invitación</strong> por WhatsApp</li>
            <li>Tus amigos tocan <strong className="text-text">Ligas → Unirse</strong> y pegan el código</li>
          </ol>
          <a
            href={`https://wa.me/?text=${WHATSAPP_MESSAGE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] text-white text-sm-s font-bold hover:opacity-90 transition-opacity"
          >
            <Share2 size={15} /> Invitar amigos por WhatsApp
          </a>
        </Step>

        {/* ── Bonus ────────────────────────────────────────────────────── */}
        <motion.div variants={staggerItem(reduced)} className="flex gap-3 p-4 rounded-xl bg-accent-soft border border-accent-border">
          <Users size={20} className="text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm-s text-muted leading-relaxed">
            <strong className="text-text">Tip:</strong> activá las notificaciones en{' '}
            <strong className="text-text">Perfil → Configuración</strong> para que te avise
            antes de que cierren los pronósticos de cada partido.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
