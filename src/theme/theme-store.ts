import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccentKey, ThemeMode } from './palettes';

export type FontScale = 1.0 | 1.15 | 1.3;

type State = {
  mode: ThemeMode;
  accent: AccentKey;
  fontScale: FontScale;
  reducedMotionOverride: 'auto' | 'on' | 'off';
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentKey) => void;
  setFontScale: (scale: FontScale) => void;
  setReducedMotion: (v: State['reducedMotionOverride']) => void;
};

export const useThemeStore = create<State>()(
  persist(
    (set) => ({
      mode: 'auto',
      accent: 'gold',
      fontScale: 1.0,
      reducedMotionOverride: 'auto',
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
      setFontScale: (fontScale) => set({ fontScale }),
      setReducedMotion: (reducedMotionOverride) => set({ reducedMotionOverride }),
    }),
    { name: 'mundialito-theme' }
  )
);
