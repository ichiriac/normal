/**
 * ESLint configuration for NormalJS ORM
 * - Node.js (CommonJS)
 * - TypeScript
 * - Jest tests
 * - Prettier for formatting integration
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
    project: './tsconfig.json',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['@typescript-eslint', 'jest'],
  rules: {
    // Allow intentionally unused args/vars prefixed with _
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-constant-condition': ['error', { checkLoops: false }],
    // Allow Object.prototype direct checks and empty blocks in some cases
    'no-prototype-builtins': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    // The Prettier plugin surfaces formatting differences as ESLint issues
    'prettier/prettier': 'warn',
    // TypeScript specific
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
  },
  overrides: [
    {
      files: ['tests/**/*.ts', '**/*.test.ts'],
      env: { jest: true, node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['demo/**/*.js'],
      rules: { 'no-console': 'off' },
    },
    {
      files: ['*.js', '*.cjs'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
    },
  ],
  ignorePatterns: ['coverage', 'node_modules', 'lcov-report', 'dist'],
};
