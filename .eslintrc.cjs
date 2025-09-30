module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2022: true
  },
  rules: {
    // Basic TypeScript rules
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    
    // Best practices
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn'
  },
  ignorePatterns: [
    'dist/**/*',
    'node_modules/**/*'
  ]
};