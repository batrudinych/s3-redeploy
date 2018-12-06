'use strict';

module.exports = {
  bail: false,
  clearMocks: true,
  moduleFileExtensions: ['js'],
  testEnvironment: 'node',
  testMatch: ['**/test/**.spec.js'],
  collectCoverage: true,
  collectCoverageFrom: ['**/src/**.js'],
  coverageReporters: ['text'],
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
