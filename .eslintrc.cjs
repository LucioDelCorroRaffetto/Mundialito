/**
 * Config de ESLint del repo. Estaba ausente (el script `npm run lint` fallaba
 * con "couldn't find a configuration file"); sin parser de TypeScript ESLint
 * ni siquiera podía leer los .ts/.tsx. Formato eslintrc legacy porque el script
 * usa `--ext ts,tsx` (la flat config no soporta `--ext`).
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'dev-dist',
    'build',
    'coverage',
    'node_modules',
    '.eslintrc.cjs',
    '*.config.ts',
    '*.config.js',
    '*.config.cjs',
    'packages/**/dist',
  ],
  rules: {
    // Hint de Fast Refresh (DX en dev), no es correctitud: varios archivos
    // exportan a propósito constantes/helpers junto al componente. Off.
    'react-refresh/only-export-components': 'off',
    // Las deps de hooks quedan como advertencia (no bloquean): hay casos
    // gestionados a mano con `data ?? []`. Útil como aviso, no como gate de CI.
    'react-hooks/exhaustive-deps': 'warn',
    // El código usa `any` puntual (catch de axios, props sueltas) — no es el
    // foco del lint; lo dejamos pasar en vez de inundar de errores.
    '@typescript-eslint/no-explicit-any': 'off',
    // Variables/args sin usar = error, pero permitimos el prefijo `_` como
    // marca explícita de "a propósito" (patrón ya usado, ej. _handleToggleStarter).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    '@typescript-eslint/no-empty-function': 'off',
  },
  overrides: [
    {
      // Backend / worker: Node puro, sin React ni Fast Refresh.
      files: ['packages/**/*.ts'],
      env: { node: true, browser: false },
      rules: {
        'react-refresh/only-export-components': 'off',
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',
      },
    },
  ],
};
