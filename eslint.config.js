import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'dist',
      'node_modules',
      '.wrangler',
      'test-results',
      'playwright-report',
    ],
  },
  {
    files: ['src/worker.js'],
    languageOptions: {
      globals: {
        Response: 'readonly',
        URL: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        console: 'readonly',
      },
    },
  },
];
