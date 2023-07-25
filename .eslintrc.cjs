module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/jsx-runtime',
    'plugin:import/recommended',
    'prettier',
  ],
  overrides: [],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react', '@typescript-eslint', 'import'],
  rules: {
    'sort-imports': [
      'warn',
      {
        ignoreDeclarationSort: true,
      },
    ],
    'import/order': [
      'warn',
      {
        alphabetize: { order: 'asc' },
        'newlines-between': 'always',
        groups: [
          'builtin',
          'external',
          'internal',
          'unknown',
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        warnOnUnassignedImports: true,
      },
    ],
    'import/newline-after-import': 'warn',
    '@typescript-eslint/ban-ts-comment': 'off',
    'react/boolean-prop-naming': 'warn',

    'react/jsx-sort-props': [
      'warn',
      {
        callbacksLast: true,
        shorthandFirst: true,
        ignoreCase: false,
      },
    ],

    'no-unused-vars': 'off', // TS takes care of this
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
}
