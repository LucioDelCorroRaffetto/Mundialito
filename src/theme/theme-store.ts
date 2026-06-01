import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccentKey, ThemeMode } from './palettes';

// Expanded after feedback that the app was hard to use for older relatives.
// 1.5 ('Extra grande') and 1.75 ('Enorme') give accessibility headroom
// without breaking the layout — tested down to 320px wide.
export type FontScale = 1.0 | 1.15 | 1.3 | 1.5 | 1.75;

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
