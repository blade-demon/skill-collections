import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // src/golden is generated D2C codegen output (Stage 6 golden); it is verified
  // byte-for-byte by the codegen-golden test and compiled by tsc -b / vite build,
  // so it is not subject to hand-authored lint ergonomics (e.g. react-refresh).
  globalIgnores(['dist', 'src/golden']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
