'use strict';

const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  { ignores: ['eslint.config.js'] },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'require-await': 'warn',
      camelcase: 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      'no-constant-binary-expression': 'error',
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'no-invalid-this': 'error',
      'no-template-curly-in-string': 'error',
      'no-use-before-define': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'require-atomic-updates': 'error',
      'spaced-comment': 'error',
      yoda: 'error',
    },
  },
];
