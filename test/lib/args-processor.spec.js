'use strict';

jest.mock('../../src/lib/utils');
const utils = require('../../src/lib/utils');
const argsProcessor = require('../../src/lib/args-processor');

describe('Arguments processor', () => {
  describe('parse', () => {
    const args = ['--arg1', 'val1', '--bool-arg-1', '--arg2', 'val2'];
    const boolArg = '--bool-arg-2';
    utils.dashToCamel.mockImplementation(el => '--' + el);

    test('returns object with properties, corresponding to each identifier', done => {
      const result = argsProcessor.parse(args);
      for (const key of Object.keys(result)) {
        const keyIndex = args.indexOf(key);
        if (!args[keyIndex + 1] || args[keyIndex + 1].startsWith('--')) {
          expect(result[key]).toEqual(true);
        } else {
          expect(result[key]).toEqual(args[keyIndex + 1]);
        }
      }
      done();
    });

    test('correctly processes bool flag in the beginning of the list', done => {
      const argsArr = [boolArg].concat(args);
      const result = argsProcessor.parse(argsArr);
      expect(Object.keys(result)).toEqual(argsArr.filter(e => e.startsWith('--')));
      expect(result[boolArg]).toEqual(true);
      done();
    });

    test('correctly processes bool flag in the end of the list', done => {
      const argsArr = args.concat(boolArg);
      const result = argsProcessor.parse(argsArr);
      expect(Object.keys(result)).toEqual(argsArr.filter(e => e.startsWith('--')));
      expect(result[boolArg]).toEqual(true);
      done();
    });

    test('omits values without pair-parameter', done => {
      const noPairValue = 'noPairValue';
      const argsArr = args.concat('noPairValue');
      const result = argsProcessor.parse(argsArr);
      for (const key of Object.keys(result)) {
        expect(result[key]).not.toEqual(noPairValue);
      }
      done();
    });

    test('transforms each identifier to camelcase', done => {
      argsProcessor.parse(args);
      expect(utils.dashToCamel).toBeCalledTimes(args.filter(a => a.startsWith('--')).length);
      done();
    });
  });

  describe('processParams', () => {
    utils.isPositiveInteger.mockImplementation(() => true);

    const params = {
      bucket: 'bucket-name',
      pattern: 'folder/**',
      cwd: './home',
      concurrency: '5',
      fileName: 'file-name',
      cfDistId: 'cf-dist-id',
      cfInvPaths: '/about;/help',
      gzip: true,
    };

    test('throws if bucket name is not supplied', done => {
      const inputParams = Object.assign({}, params);
      delete inputParams.bucket;
      try {
        argsProcessor.processParams(inputParams);
        return done(new Error('Should have thrown'));
      } catch (e) {
        expect(e.message).toEqual('Bucket name should be set');
        done();
      }
    });

    test('throws if bucket name contains slash', done => {
      const inputParams = Object.assign({}, params);
      inputParams.bucket += '/';
      try {
        argsProcessor.processParams(inputParams);
        return done(new Error('Should have thrown'));
      } catch (e) {
        expect(e.message).toEqual('Bucket name should contain no slashes');
        done();
      }
    });

    test('throws if bucket name contains backslash', done => {
      const inputParams = Object.assign({}, params);
      inputParams.bucket += '\\';
      try {
        argsProcessor.processParams(inputParams);
        return done(new Error('Should have thrown'));
      } catch (e) {
        expect(e.message).toEqual('Bucket name should contain no slashes');
        done();
      }
    });

    test('sanitizes values', done => {
      const inputParams = {
        bucket: params.bucket,
      };
      const resultParams = argsProcessor.processParams(inputParams);
      expect(resultParams.pattern).toEqual('./**');
      expect(resultParams.cwd).toEqual('');
      expect(resultParams.concurrency).toEqual(5);
      expect(resultParams.fileName).toEqual(`_s3-rd.${inputParams.bucket}.json`);
      expect(Object.keys(resultParams).length).toEqual(5);
      done();
    });

    test('processes passed values', done => {
      const inputParams = Object.assign({}, params);
      const resultParams = argsProcessor.processParams(inputParams);
      expect(resultParams.bucket).toEqual(params.bucket);
      expect(resultParams.pattern).toEqual(params.pattern);
      expect(resultParams.cwd).toEqual(params.cwd);
      expect(resultParams.concurrency).toEqual(parseInt(params.concurrency, 10));
      expect(resultParams.fileName).toEqual(params.fileName);
      expect(resultParams.cfDistId).toEqual(params.cfDistId);
      expect(resultParams.cfInvPaths).toEqual(params.cfInvPaths.split(';'));
      expect(resultParams.gzip).toEqual(params.gzip);
      expect(Object.keys(resultParams).length).toEqual(8);
      done();
    });

    test('throws if concurrency is not a positive integer', done => {
      const inputParams = Object.assign({}, params);
      utils.isPositiveInteger.mockImplementation(() => false);
      try {
        argsProcessor.processParams(inputParams);
        done(new Error('Should have thrown'));
      } catch (e) {
        expect(e.message).toEqual('Concurrency value should be a positive integer');
        done();
      }
    });

    test('converts concurrency to integer if it represents a positive integer', done => {
      const inputParams = Object.assign({}, params);
      utils.isPositiveInteger.mockImplementation(() => true);
      const resultParams = argsProcessor.processParams(inputParams);
      expect(typeof resultParams.concurrency).toEqual('number');
      expect(resultParams.concurrency).toEqual(parseInt(params.concurrency, 10));
      done();
    });

    test('removes a trailing slash from file name', done => {
      const inputParams = Object.assign({}, params);
      inputParams.fileName = '/' + inputParams.fileName;
      const resultParams = argsProcessor.processParams(inputParams);
      expect(resultParams.fileName).toEqual(params.fileName);
      done();
    });

    test('processes invalidation paths', done => {
      const inputParams = Object.assign({}, params);
      inputParams.cfInvPaths = '/path1;path2;;';
      const resultParams = argsProcessor.processParams(inputParams);
      expect(resultParams.cfInvPaths).toEqual(
        inputParams.cfInvPaths.split(';').filter(Boolean).map(v => v[0] === '/' ? v : '/' + v));
      done();
    });

    test('processes gzip extensions', done => {
      const inputParams = Object.assign({}, params);
      inputParams.gzip = 'txt; HTML;;';
      const resultParams = argsProcessor.processParams(inputParams);
      expect(resultParams.gzip).toEqual(
        inputParams.gzip.replace(/ /g, '').split(';').filter(Boolean).map(s => s.toLowerCase()));
      done();
    });
  });
});
