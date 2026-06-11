import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const nodeGlobals = {
  ...globals.es2022,
  ...globals.node,
};

const browserGlobals = {
  ...globals.browser,
  ...globals.es2022,
};

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.vite/**',
    '**/coverage/**',
    '**/.d2c-run-*/**',
    '.claude/**',
    'fixtures/**',
    'docs/superpowers/plans/**',
    'skills/design-to-spec/examples/**',
    'samples/**/design-spec/**',
    'skills/sketch-to-component/scripts/src/__tests__/fixtures/*.json',
  ]),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['samples/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      'preserve-caught-error': 'off',
    },
  },
  eslintConfigPrettier,
]);
