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
  // The two override blocks that used to live here - one disabling
  // react-refresh/only-export-components and one disabling the new v7
  // react-hooks correctness rules - were scoped to src/components/ui/** and
  // src/hooks/use-mobile.ts. Those files were shadcn scaffolding that nothing
  // in the app imported, so the blocks are gone with them and the rules they
  // suppressed are enforced across the whole frontend again. If shadcn
  // components are added back, re-add the blocks; components.json is still
  // present so `npx shadcn add <name>` works as before.
])
