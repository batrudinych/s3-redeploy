'use strict';

const errors = require('../../src/lib/errors');

describe('Errors', () => {
  describe('CommonError', () => {
    test('adds originalError property if an error has been passed', done => {
      const originalError = new Error('Example error');
      const commonErrorInstance = new errors.CommonError('Error instance', originalError);
      expect(commonErrorInstance.originalError instanceof Error).toEqual(true);
      expect(commonErrorInstance.originalError).toEqual(originalError);
      done();
    });

    test('has no originalError property if nothing has been passed', done => {
      const commonErrorInstance = new errors.CommonError('Error instance');
      expect(commonErrorInstance.originalError).toEqual(undefined);
      done();
    });

    test('wraps message', done => {
      const message = 'Example error message';
      const commonErrorInstance = new errors.CommonError(message);
      expect(commonErrorInstance.message).toEqual(message);
      done();
    });
  });
});
