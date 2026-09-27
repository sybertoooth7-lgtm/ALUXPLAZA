import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'coverage'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // public/ is served as static assets, not run by Node: the legacy admin
    // panel in public/admin/ is plain browser JS and legitimately uses
    // document/alert/confirm. Linting it under Node globals reported every
    // one of those as no-undef. The rest of the config still applies, so
    // real mistakes in that file are still caught.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
];
