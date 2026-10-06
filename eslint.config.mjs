import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import nextPlugin from '@next/eslint-plugin-next'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['.next', 'dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.recommended,
    ],
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // Next.js App Router server modules legitimately export metadata and
    // non-component functions alongside components — the Vite-oriented
    // fast-refresh rule does not apply to them.
    files: ['src/app/**/*.{ts,tsx}', 'src/server/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Vendored Bklit registry code (official @bklit/bar-chart install).
    // Third-party chart internals trip the project's strict v7 hooks rules
    // (ref syncs, mount effects, multi-export modules) by design — rewriting
    // them would fork us from registry updates. Our wrapper
    // (charts/ValueHistogram.tsx) stays fully linted; only the vendored
    // modules are exempted here.
    files: ['src/components/charts/**/*.{ts,tsx}'],
    ignores: ['src/components/charts/ValueHistogram*.{ts,tsx}'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
