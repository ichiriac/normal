/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s'],
  collectCoverageFrom: ['src/**/*.js', '!src/cache/**/*.js', 'index.js'],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  verbose: false,
};
