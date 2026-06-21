import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ─── Messages ────────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Calentando motores en el vestuario...',
  'Pasando las pecheras...',
  'Inflando las pelotas...',
  'Pintando las líneas del campo...',
  'Buscando al árbitro...',
  'Preparando las cámaras del VAR...',
  'Afinando el himno...',
  'Guardando los teléfonos al banco de suplentes...',
  'Aplicando la vaselina en los arcos...',
  'Convocando a los 26 jugadores...',
  'Consultando con el VAR si el servidor está on-side...',
  'Cargando la ruleta de penales...',
  'Activando el modo Maradona...',
  'Revisando si hubo penal en el área...',
  'Negociando el contrato del DT...',
];

const TIPS = [
  '⚽ La primera predicción vale doble en las charlas del asado.',
  '📊 Acertar el marcador exacto suma 5 pts. ¡Jugátela!',
  '🏆 Los logros te suben de nivel y desbloquean títulos.',
  '⭐ En Fantasy, tu capitán suma puntos x2 cada fecha.',
  '🎯 Pronosticá los 72 partidos de grupos y desbloqueás un logro.',
  '🔔 Activá las notificaciones para el aviso de 30 min antes de cada partido.',
  '👑 Podés armar tu propia liga y desafiar a tus amigos.',
  '🐺 Ganar sin haber estado en top 3 antes de cuartos... hay un logro para eso.',
];

// ─── Animated football ───────────────────────────────────────────────────────

function BouncingBall() {
  return (
    <div className="relative w-20 h-24 mx-auto mb-6 flex items-end justify-center">
      {/* Shadow */}
      <motion.div
        className="absolute bottom-0 w-10 h-2 rounded-full bg-black/20 dark:bg-white/10"
        animate={{ scaleX: [0.8, 1.2, 0.8], opacity: [0.3, 0.15, 0.3] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Ball */}
      <motion.div
        className="w-14 h-14 rounded-full text-5xl flex items-center justify-center select-none"
        animate={{ y: [0, -48, 0] }}
        transition={{
          duration: 0.7,
          repeat: Infinity,
          ease: [0.4, 0, 0.2, 1], // easeInOutQuad — natural bounce
        }}
      >
        ⚽
      </motion.div>
    </div>
  );
}

// ─── Progress dots ───────────────────────────────────────────────────────────

function ProgressDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent"
          animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
}

export function ApiWakeupScreen({ visible }: Props) {
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length));
  const [tipIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [elapsed, setElapsed] = useState(0);

  // Cycle through loading messages every 2.5 s so there's always something
  // new to read during a long cold start.
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
      setElapsed((s) => s + 2.5);
    }, 2500);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="wakeup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center
                     bg-bg text-text px-6 select-none"
        >
          {/* Logo / wordmark */}
          <motion.p
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-logo text-3xl text-accent mb-8 tracking-wide"
          >
            Mundialito
          </motion.p>

          <BouncingBall />

          {/* Loading message — fades between messages */}
          <div className="h-7 flex items-center justify-center mb-2">
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="text-sm-s font-semibold text-text text-center"
              >
                {LOADING_MESSAGES[msgIdx]}
              </motion.p>
            </AnimatePresence>
          </div>

          <ProgressDots />

          {/* Tip — stays fixed so it's actually readable */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-10 max-w-xs text-center"
          >
            <p className="text-xs-s text-muted/80 leading-relaxed">{TIPS[tipIdx]}</p>
          </motion.div>

          {/* Long-wait explanation — only shows after 8 s so normal users
              never see it, but cold-start victims understand what's happening */}
          {elapsed >= 8 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-xs-s text-muted/50 text-center max-w-xs leading-snug"
            >
              El servidor estuvo en pausa. Tardará unos segundos más en arrancar.
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
