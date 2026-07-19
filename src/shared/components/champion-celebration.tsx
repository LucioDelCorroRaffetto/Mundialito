import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useMotionPrefs } from '@/shared/lib/motion';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import type { OutcomeTeamRef } from '@/shared/hooks/use-tournament-predictions';
import type { Team } from '@/shared/types/api';

const GOLD = '#eab308';
const FIREWORK_COLORS = ['#eab308', '#facc15', '#fef08a', '#ffffff', 'var(--accent)'];

interface FireworkSpec {
  id: number;
  /** Centro del estallido, en % del contenedor. */
  cx: number;
  cy: number;
  /** Delay inicial del estallido dentro del ciclo. */
  delay: number;
  /** Partículas del estallido (posiciones determinísticas, sin Math.random). */
  particles: Array<{ id: number; x: number; y: number; size: number; color: string }>;
}

/** Estallidos determinísticos — mismos por instancia, sin Math.random en render
 *  (mismo criterio que ConfettiBurst). Cada estallido: 10 partículas radiales. */
function makeFireworks(): FireworkSpec[] {
  const bursts = [
    { cx: 18, cy: 28, delay: 0 },
    { cx: 82, cy: 22, delay: 0.9 },
    { cx: 65, cy: 62, delay: 1.7 },
    { cx: 30, cy: 70, delay: 2.4 },
    { cx: 50, cy: 18, delay: 3.1 },
  ];
  return bursts.map((b, bi) => ({
    id: bi,
    ...b,
    particles: Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2 + bi * 0.35;
      const distance = 34 + ((i * 17 + bi * 11) % 22); // 34–56px
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 3 + ((i + bi) % 3), // 3–5px
        color: FIREWORK_COLORS[(i + bi) % FIREWORK_COLORS.length],
      };
    }),
  }));
}

/** Capa de fuegos artificiales en loop — solo transform/opacity, se apaga
 *  entera con reduce-motion (el caller ni la monta). */
function FireworksLayer() {
  const fireworks = useMemo(makeFireworks, []);
  const CYCLE = 4; // segundos entre estallidos del mismo punto

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {fireworks.map((fw) => (
        <div
          key={fw.id}
          className="absolute"
          style={{ left: `${fw.cx}%`, top: `${fw.cy}%` }}
        >
          {fw.particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{ width: p.size, height: p.size, backgroundColor: p.color }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: [0, p.x, p.x * 1.15],
                y: [0, p.y, p.y * 1.15 + 8],
                opacity: [0, 1, 0],
                scale: [0.4, 1, 0.6],
              }}
              transition={{
                duration: 1.3,
                delay: fw.delay,
                repeat: Infinity,
                repeatDelay: CYCLE - 1.3,
                ease: 'easeOut',
              }}
            />
          ))}
          {/* Destello central del estallido */}
          <motion.span
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 10, height: 10, backgroundColor: '#fff' }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0, 1.6, 0.2] }}
            transition={{
              duration: 0.5,
              delay: fw.delay,
              repeat: Infinity,
              repeatDelay: CYCLE - 0.5,
              ease: 'easeOut',
            }}
          />
        </div>
      ))}
    </div>
  );
}

interface Props {
  champion: OutcomeTeamRef;
  runnerUp?: OutcomeTeamRef | null;
  thirdPlace?: OutcomeTeamRef | null;
  teamMap: Map<number, Team> | undefined;
}

/**
 * Hero de la home cuando el Mundial ya tiene campeón: bandera + nombre del
 * equipo campeón con fuegos artificiales en loop. Reemplaza al CountdownHero
 * (la home lo esconde cuando esto se muestra). Con reduce-motion los fuegos
 * no se montan y queda el hero estático con el brillo dorado.
 */
export function ChampionCelebration({ champion, runnerUp, thirdPlace, teamMap }: Props) {
  const { reduced } = useMotionPrefs();
  const championTeam = teamMap?.get(champion.id);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6"
      style={{
        borderColor: `${GOLD}66`,
        background: `linear-gradient(135deg, ${GOLD}2e, var(--card) 55%, ${GOLD}14)`,
        boxShadow: `0 0 40px -12px ${GOLD}80`,
      }}
    >
      {!reduced && <FireworksLayer />}

      {/* Sheen dorado que barre el hero (mismo patrón del hero de countdown) */}
      {!reduced && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
          aria-hidden
        />
      )}

      {/* Trofeo watermark */}
      <span
        className="absolute -right-5 -bottom-6 text-[120px] opacity-[0.07] select-none pointer-events-none"
        aria-hidden
      >
        🏆
      </span>

      <div className="relative flex flex-col items-center text-center">
        <motion.span
          className="text-4xl mb-1"
          aria-hidden
          initial={reduced ? false : { scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
        >
          🏆
        </motion.span>
        <p
          className="text-[11px] font-bold uppercase tracking-[0.35em] mb-3"
          style={{ color: GOLD }}
        >
          Campeón del mundo
        </p>

        <motion.div
          className="flex flex-col items-center gap-2"
          initial={reduced ? false : { y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
        >
          {championTeam && (
            <TeamFlag code={championTeam.code} emoji={championTeam.flag} size={64} />
          )}
          <h2 className="text-3xl font-display font-black text-text leading-tight">
            {championTeam?.name ?? champion.name}
          </h2>
        </motion.div>

        {(runnerUp || thirdPlace) && (
          <p className="mt-3 text-xs text-muted flex items-center gap-3">
            {runnerUp && (
              <span className="flex items-center gap-1">
                <span aria-hidden>🥈</span> {runnerUp.code}
              </span>
            )}
            {thirdPlace && (
              <span className="flex items-center gap-1">
                <span aria-hidden>🥉</span> {thirdPlace.code}
              </span>
            )}
          </p>
        )}

        <Link
          to="/tournament"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: GOLD }}
        >
          Ver cómo quedaron tus picks de Copa
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
