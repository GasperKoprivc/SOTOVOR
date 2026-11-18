import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['**/node_modules/**', '**/build/**', '**/dist/**', '**/target/**', '**/.gradle/**', 'data/**'],
  },
  js.configs.recommended,
  { files: ['apps/desktop/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['deploy/mongo-init.js'], languageOptions: { globals: { db: 'readonly' } } },
  { files: ['e2e/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
  {
    files: ['frontend/**/*.js', 'frontend/**/*.jsx'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // JSX references are resolved by the React compiler, not ESLint's core scope analysis.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];
