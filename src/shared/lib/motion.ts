/**
 * Primitivas de motion reutilizables (framer-motion) para Mundialito.
 *
 * Objetivo: curvas y duraciones consistentes en toda la app, rápidas en
 * mobile (150–320ms) y a 60fps (solo transform/opacity, nunca layout/width).
 *
 * ⚠️ Reduce-motion: el CSS de `index.css` neutraliza animaciones CSS cuando
 * `[data-reduce-motion="true"]`, pero las animaciones JS de framer-motion NO
 * se neutralizan solas. Para degradar a "sin movimiento" usá el hook
 * `useMotionPrefs()` de este módulo (envuelve `useReducedMotion()` de
 * framer-motion) y elegí los variants reducidos cuando corresponda. Los
 * helpers que terminan en `*Variants` ya aceptan un flag `reduced`.
 *
 * Estos helpers son opt-in: las páginas y componentes PUEDEN consumirlos,
 * pero no se asume que ya lo hagan.
 */
import { useReducedMotion, type Transition, type Variants } from 'framer-motion';

// ─── Curvas y duraciones base ────────────────────────────────────────────────

/** Easings estándar. `standard` = material "ease-out" para entradas;
 *  `emphasized` para salidas/acentos; `linear` para loops. */
export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  emphasized: [0.2, 0, 0, 1],
  linear: 'linear',
} as const;

/** Duraciones en segundos (framer usa segundos). Mobile-first: cortas. */
export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.32,
} as const;

// ─── Transitions reutilizables ───────────────────────────────────────────────

/** Tween suave para entradas/salidas (fade, slide). */
export const tweenBase: Transition = {
  duration: DURATION.base,
  ease: EASE.standard,
};

export const tweenFast: Transition = {
  duration: DURATION.fast,
  ease: EASE.standard,
};

/** Spring para feedback de tap / pop de modales — corto y firme, sin rebote
 *  exagerado que maree. */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 26,
};

/** Spring suave para sheets que entran desde abajo. */
export const springSheet: Transition = {
  type: 'spring',
  damping: 30,
  stiffness: 300,
};

// ─── Variants base (cada uno acepta `reduced` para degradar a opacity-only) ──

/** Fade puro. */
export function fadeVariants(reduced = false): Variants {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: reduced ? tweenFast : tweenBase },
    exit: { opacity: 0, transition: tweenFast },
  };
}

/** Slide-up + fade. Con reduce-motion degrada a fade puro (sin desplazamiento). */
export function slideUpVariants(reduced = false, distance = 16): Variants {
  return {
    initial: { opacity: 0, y: reduced ? 0 : distance },
    animate: { opacity: 1, y: 0, transition: reduced ? tweenFast : tweenBase },
    exit: { opacity: 0, y: reduced ? 0 : distance, transition: tweenFast },
  };
}

/** Scale + fade (pop). Para modales/cards. Con reduce-motion degrada a fade. */
export function scaleVariants(reduced = false): Variants {
  return {
    initial: { opacity: 0, scale: reduced ? 1 : 0.92 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: reduced ? tweenFast : springSnappy,
    },
    exit: { opacity: 0, scale: reduced ? 1 : 0.95, transition: tweenFast },
  };
}

/** Sheet que entra desde abajo (share-sheet, bottom sheets). Con reduce-motion
 *  degrada a fade (no se desliza). */
export function sheetVariants(reduced = false): Variants {
  return {
    initial: { y: reduced ? 0 : '100%', opacity: reduced ? 0 : 1 },
    animate: { y: 0, opacity: 1, transition: reduced ? tweenFast : springSheet },
    exit: { y: reduced ? 0 : '100%', opacity: reduced ? 0 : 1, transition: tweenFast },
  };
}

// ─── Stagger para listas ─────────────────────────────────────────────────────

/** Contenedor que escalona la entrada de sus hijos. Usar con `staggerItem`.
 *  Con reduce-motion el stagger se anula (todos entran juntos). */
export function staggerContainer(reduced = false, stagger = 0.04): Variants {
  return {
    initial: {},
    animate: {
      transition: {
        staggerChildren: reduced ? 0 : stagger,
        delayChildren: reduced ? 0 : 0.02,
      },
    },
  };
}

/** Item de una lista escalonada. Combinar con `staggerContainer`. */
export function staggerItem(reduced = false): Variants {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: reduced ? tweenFast : tweenBase },
  };
}

// ─── Tap feedback ────────────────────────────────────────────────────────────

/** whileTap para botones/elementos presionables. Sutil scale-down. */
export const tapScale = { scale: 0.96 } as const;
export const tapScaleStrong = { scale: 0.92 } as const;

// ─── Hook de preferencias ────────────────────────────────────────────────────

/**
 * Envuelve `useReducedMotion()` de framer-motion. Devuelve `{ reduced }`
 * donde `reduced` es true si el usuario pidió menos movimiento (sistema u
 * override de la app vía media query). Pasá `reduced` a los `*Variants` y
 * condicioná `whileTap`/`animate` para degradar a sin-movimiento.
 *
 * Ejemplo:
 *   const { reduced } = useMotionPrefs();
 *   <motion.div variants={slideUpVariants(reduced)} ... />
 */
export function useMotionPrefs(): { reduced: boolean } {
  const reduced = useReducedMotion();
  return { reduced: reduced ?? false };
}
