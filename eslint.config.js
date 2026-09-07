import js from '@eslint/js'
import perfectionist from 'eslint-plugin-perfectionist'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  perfectionist.configs['recommended-natural'],
  reactHooks.configs.flat['recommended-latest'],
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-unused-vars': 'off',
      'perfectionist/sort-classes': 'off',
      'react/boolean-prop-naming': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
    settings: { react: { version: '19.2' } },
  },
)
