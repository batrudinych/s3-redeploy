'use strict';

const stream = require('stream');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const utils = require('../../src/lib/utils');

jest.mock('glob');
const glob = require('glob');

describe('Utils', () => {
  describe('gzipStream', () => {
    test('pipes gzip stream to passed one', () => {
      const readStreamMock = new stream.Readable();
      const gzipStreamMock = new stream.Transform();
      readStreamMock._read = () => {
      };
      gzipStreamMock._read = () => {
      };
      gzipStreamMock._write = () => {
      };
      readStreamMock.pipe = jest.fn(() => readStreamMock);
      jest.spyOn(zlib, 'createGzip').mockReturnValue(gzipStreamMock);
      const outputStream = utils.gzipStream(readStreamMock);
      expect(outputStream).toEqual(readStreamMock);
      expect(readStreamMock.pipe).toBeCalledTimes(1);
      expect(readStreamMock.pipe).toBeCalledWith(gzipStreamMock);
    });
  });

  describe('gzipAsync', () => {
    test('resolves with gzipped data', done => {
      const data = 'data';
      const gzippedData = 'gzip';
      jest.spyOn(zlib, 'gzip').mockImplementation((data, cb) => cb(null, gzippedData));
      utils.gzipAsync(data)
        .then(result => {
          expect(zlib.gzip).toBeCalledTimes(1);
          expect(zlib.gzip.mock.calls[0][0]).toEqual(data);
          expect(result).toEqual(gzippedData);
          done();
        })
        .catch(done);
    });

    test('rejects with an error', done => {
      const errorMessage = 'Error message';
      jest.spyOn(zlib, 'gzip').mockImplementation((data, cb) => cb(new Error(errorMessage)));
      utils.gzipAsync('')
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual(errorMessage);
          done();
        });
    });
  });

  describe('gunzipAsync', () => {
    test('resolves with gunzipped data', done => {
      const data = 'data';
      const gunzippedData = 'gunzip';
      jest.spyOn(zlib, 'gunzip').mockImplementation((data, cb) => cb(null, gunzippedData));
      utils.gunzipAsync(data)
        .then(result => {
          expect(zlib.gunzip).toBeCalledTimes(1);
          expect(zlib.gunzip.mock.calls[0][0]).toEqual(data);
          expect(result).toEqual(gunzippedData);
          done();
        })
        .catch(done);
    });

    test('rejects with an error', done => {
      const errorMessage = 'Error message';
      jest.spyOn(zlib, 'gunzip').mockImplementation((data, cb) => cb(new Error(errorMessage)));
      utils.gunzipAsync('')
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual(errorMessage);
          done();
        });
    });
  });

  describe('fsStatAsync', () => {
    test('resolves with stats', done => {
      const path = __filename;
      const fileStats = { isFile: () => true };
      jest.spyOn(fs, 'stat').mockImplementation((path, cb) => cb(null, fileStats));
      utils.fsStatAsync(path)
        .then(result => {
          expect(fs.stat).toBeCalledTimes(1);
          expect(fs.stat.mock.calls[0][0]).toEqual(path);
          expect(result).toEqual(fileStats);
          done();
        })
        .catch(done);
    });

    test('rejects with an error', done => {
      const errorMessage = 'Error message';
      jest.spyOn(fs, 'stat').mockImplementation((path, cb) => cb(new Error(errorMessage)));
      utils.fsStatAsync('')
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual(errorMessage);
          done();
        });
    });
  });

  describe('globAsync', () => {
    test('resolves with file paths', done => {
      const pattern = './**';
      const options = { cwd: process.cwd() };
      const paths = [__filename, __filename];
      glob.mockImplementation((pattern, options, cb) => cb(null, paths));
      utils.globAsync(pattern, options)
        .then(result => {
          expect(glob).toBeCalledTimes(1);
          expect(glob.mock.calls[0][0]).toEqual(pattern);
          expect(glob.mock.calls[0][1]).toEqual(options);
          expect(result).toEqual(paths);
          done();
        })
        .catch(done);
    });

    test('rejects with an error', done => {
      const errorMessage = 'Error message';
      glob.mockImplementation((pattern, options, cb) => cb(new Error(errorMessage)));
      utils.globAsync('', '')
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual(errorMessage);
          done();
        });
    });
  });

  describe('shouldGzip', () => {
    test('returns nothing if gzip is false', () => {
      expect(utils.shouldGzip(__filename, false)).toEqual(undefined);
    });

    test('returns true if gzip is truthy', () => {
      expect(utils.shouldGzip(__filename, 'true')).toEqual(true);
    });

    test('verifies file extension against given list', () => {
      expect(utils.shouldGzip(__filename, ['js', 'txt'])).toEqual(true);
      expect(utils.shouldGzip(__filename, ['html', 'txt'])).toEqual(false);
      expect(utils.shouldGzip('/home/noextension', ['js', 'html', 'txt'])).toEqual(undefined);
    });
  });

  describe('dashToCamel', () => {
    test('returns empty string if input value is falsey', () => {
      expect(utils.dashToCamel('')).toEqual('');
    });

    test('removes dashes and capitalizes parts', () => {
      const inputString = '--part-a-pArtb--';
      const expected = 'partAPartb';
      expect(utils.dashToCamel(inputString)).toEqual(expected);
    });
  });

  describe('isPositiveInteger', () => {
    test('returns false if value is not a number', () => {
      expect(utils.isPositiveInteger('not a number')).toEqual(false);
    });

    test('returns false if value is negative', () => {
      expect(utils.isPositiveInteger('-1')).toEqual(false);
    });

    test('returns false if value is 0', () => {
      expect(utils.isPositiveInteger('0')).toEqual(false);
    });

    test('returns false if value contains excess symbols', () => {
      expect(utils.isPositiveInteger('1a')).toEqual(false);
    });

    test('returns true if value represents a positive integer', () => {
      expect(utils.isPositiveInteger('1')).toEqual(true);
    });
  });
});
