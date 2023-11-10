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
    'plugin:perfectionist/recommended-natural',
    'prettier',
  ],
  overrides: [],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react', '@typescript-eslint', 'import', 'perfectionist'],
  rules: {
    'import/newline-after-import': 'warn',
    'react/boolean-prop-naming': 'warn',

    /**
     * DISABLED RULES
     */
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-unused-vars': 'off', // TS takes care of this
    'perfectionist/sort-classes': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
}
