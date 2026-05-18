import { useEffect, useState } from 'react';
import { useThemeStore } from './theme-store';
import { accentPalettes, modeVars, type ResolvedMode } from './palettes';

function getSystemMode(): ResolvedMode {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSystemReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode, accent, fontScale, reducedMotionOverride } = useThemeStore();
  const [systemMode, setSystemMode] = useState<ResolvedMode>(getSystemMode);
  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(getSystemReducedMotion);

  // Listener para cambios del SO en color scheme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemMode(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Listener para reduced motion del SO
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Aplica las CSS vars al :root cuando cambia mode/accent/scale
  useEffect(() => {
    const root = document.documentElement;
    const resolved: ResolvedMode = mode === 'auto' ? systemMode : mode;

    root.setAttribute('data-mode', resolved);

    const vars = modeVars[resolved];
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

    const p = accentPalettes[accent];
    root.style.setProperty('--accent', p.color);
    root.style.setProperty('--accent-on', p.on);
    root.style.setProperty('--accent-soft', `${p.color}14`);   // ~8% alpha
    root.style.setProperty('--accent-border', `${p.color}4D`); // ~30% alpha

    root.style.setProperty('--font-scale', String(fontScale));

    const motionDisabled =
      reducedMotionOverride === 'on' ||
      (reducedMotionOverride === 'auto' && systemReducedMotion);
    root.setAttribute('data-reduce-motion', motionDisabled ? 'true' : 'false');
  }, [mode, accent, fontScale, reducedMotionOverride, systemMode, systemReducedMotion]);

  return <>{children}</>;
}
