'use strict';

const logger = require('../../src/lib/logger');

describe('Logger', () => {
  describe('get', () => {
    test('returns default logger instance', () => {
      const instance = logger.get();
      expect(instance._level).toEqual(1);
    });

    test('returns the same logger instance', () => {
      const instance1 = logger.get();
      const instance2 = logger.get();
      expect(instance1).toEqual(instance2);
    });
  });

  describe('init', () => {
    test('returns a default logger instance with info level', () => {
      const loggerInstance = logger.init();
      jest.spyOn(console, 'log');
      expect(typeof loggerInstance.info).toBe('function');
      expect(typeof loggerInstance.verbose).toBe('function');
      expect(typeof loggerInstance.error).toBe('function');
      loggerInstance.info();
      expect(console.log).toBeCalledTimes(1);
      loggerInstance.verbose();
      expect(console.log).toBeCalledTimes(1);
      loggerInstance.error();
      expect(console.log).toBeCalledTimes(2);
    });

    test('returns a logger instance with verbose level', () => {
      const loggerInstance = logger.init({ level: 'verbose' });
      jest.spyOn(console, 'log');
      expect(typeof loggerInstance.info).toBe('function');
      expect(typeof loggerInstance.verbose).toBe('function');
      expect(typeof loggerInstance.error).toBe('function');
      loggerInstance.info();
      expect(console.log).toBeCalledTimes(1);
      loggerInstance.verbose();
      expect(console.log).toBeCalledTimes(2);
      loggerInstance.error();
      expect(console.log).toBeCalledTimes(3);
    });

    test('returns a logger instance with error level', () => {
      const loggerInstance = logger.init({ level: 'error' });
      jest.spyOn(console, 'log');
      expect(typeof loggerInstance.info).toBe('function');
      expect(typeof loggerInstance.verbose).toBe('function');
      expect(typeof loggerInstance.error).toBe('function');
      loggerInstance.info();
      expect(console.log).toBeCalledTimes(0);
      loggerInstance.verbose();
      expect(console.log).toBeCalledTimes(0);
      loggerInstance.error();
      expect(console.log).toBeCalledTimes(1);
    });
  });
});
