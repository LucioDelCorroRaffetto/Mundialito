import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg-deep)',
        card: 'var(--bg-card)',
        elevated: 'var(--bg-elevated)',
        border: 'var(--border-color)',
        text: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-on': 'var(--accent-on)',
        'accent-soft': 'var(--accent-soft)',
        'accent-border': 'var(--accent-border)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        logo: ['"Russo One"', 'sans-serif'],
      },
      fontSize: {
        'xs-s': 'calc(0.6875rem * var(--font-scale, 1))',
        'sm-s': 'calc(0.8125rem * var(--font-scale, 1))',
        'base-s': 'calc(0.9375rem * var(--font-scale, 1))',
        'lg-s': 'calc(1.0625rem * var(--font-scale, 1))',
        'xl-s': 'calc(1.25rem * var(--font-scale, 1))',
        '2xl-s': 'calc(1.5rem * var(--font-scale, 1))',
        '3xl-s': 'calc(2rem * var(--font-scale, 1))',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        glow: '0 0 24px var(--accent-soft)',
        card: '0 4px 16px rgba(0,0,0,0.15)',
      },
      animation: {
        'fade-in':   'fadeIn 200ms ease-out',
        'slide-up':  'slideUp 320ms cubic-bezier(0.4, 0, 0.2, 1)',
        'spin-slow': 'spin 4s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
