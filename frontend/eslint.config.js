import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // shadcn/ui-generated components (components.json) — these files pair a
    // component export with a cva()/utility export in the same file by
    // shadcn's own convention, which is exactly what react-refresh/only-
    // export-components flags. Not app code we hand-edit; every shadcn
    // project hits this on these same generated files.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // The two rules below are new in eslint-plugin-react-hooks v7 (the
    // React Compiler-era correctness rules). v7 flags three patterns that
    // ship verbatim in shadcn's own generated source:
    //   - carousel.tsx calls onSelect(api) synchronously in an effect to
    //     publish initial state to the parent,
    //   - sidebar.tsx computes a decorative width from Math.random(),
    //   - use-mobile.ts sets state from a matchMedia listener on mount.
    // None are bugs here, and hand-patching them would be silently undone
    // by the next `shadcn add`. Scoped to the shadcn-managed paths only
    // (components.json aliases: ui -> @/components/ui, hooks -> @/hooks) so
    // these rules stay enforced on the code we actually own.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
])
