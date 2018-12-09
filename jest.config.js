'use strict';

module.exports = {
  bail: true,
  silent: true,
  clearMocks: true,
  restoreMocks: true,
  moduleFileExtensions: ['js', 'json'],
  testEnvironment: 'node',
  testMatch: ['**/test/**.spec.js'],
  collectCoverage: true,
  collectCoverageFrom: ['**/src/**.js'],
  coverageReporters: ['text', 'html'],
  coverageDirectory: 'test/coverage',
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
