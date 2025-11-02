/**
 * ESLint configuration for NormalJS ORM
 * - Node.js (CommonJS)
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
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  extends: ['eslint:recommended', 'plugin:jest/recommended', 'plugin:prettier/recommended'],
  plugins: ['jest'],
  rules: {
    // Allow intentionally unused args/vars prefixed with _
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-constant-condition': ['error', { checkLoops: false }],
    // Allow Object.prototype direct checks and empty blocks in some cases
    'no-prototype-builtins': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    // The Prettier plugin surfaces formatting differences as ESLint issues
    'prettier/prettier': 'warn',
  },
  overrides: [
    {
      files: ['tests/**/*.js', '**/*.test.js'],
      env: { jest: true, node: true },
    },
    {
      files: ['demo/**/*.js'],
      rules: { 'no-console': 'off' },
    },
  ],
  ignorePatterns: ['coverage', 'node_modules', 'lcov-report', 'dist'],
};
