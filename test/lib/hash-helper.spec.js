'use strict';

const co = require('co');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const stream = require('stream');

jest.mock('../../src/lib/utils');
const utils = require('../../src/lib/utils');
const hashHelper = require('../../src/lib/hash-helper');

describe('Hash helper', () => {
  describe('computeFileHash', () => {
    test('resolves with MD5 hash of file', done => {
      hashHelper._computeFileHash(__filename)
        .then(hash => {
          const data = fs.readFileSync(__filename);
          const syncHash = crypto.createHash('md5').update(data).digest();
          expect(hash).toEqual(syncHash);
          done();
        })
        .catch(done);
    });

    test('rejects on error during reading', done => {
      const originalMethod = fs.createReadStream;
      const streamMock = new stream.Readable();
      streamMock._read = () => {
      };
      fs.createReadStream = jest.fn(() => streamMock);

      setImmediate(() => streamMock.emit('error', new Error('Example error')));
      hashHelper._computeFileHash(__filename)
        .then(() => {
          fs.createReadStream = originalMethod;
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          fs.createReadStream = originalMethod;
          expect(e.message).toEqual('Example error');
          done();
        });
    });

    test('closes read stream, ends hash stream on error while piping and rejects', done => {
      const originalMethod = crypto.createHash;
      const closeSpy = jest.spyOn(fs.ReadStream.prototype, 'close');
      const endSpy = jest.spyOn(stream.Transform.prototype, 'end');
      const streamMock = new stream.Transform();
      streamMock._read = () => {
      };
      streamMock._write = () => {
      };
      crypto.createHash = jest.fn(() => streamMock);
      setImmediate(() => streamMock.emit('error', new Error('Example error')));
      hashHelper._computeFileHash(__filename)
        .then(() => {
          crypto.createHash = originalMethod;
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          crypto.createHash = originalMethod;
          expect(e.message).toEqual('Example error');
          expect(closeSpy).toBeCalledTimes(1);
          expect(endSpy).toBeCalledTimes(1);
          done();
        });
    });
  });

  describe('getFileNameProcessor', () => {
    const fileNames = ['/folder1/file1', '/folder1', ''];
    const basePath = '/home/website';

    test('returns a processor function', () => {
      const processorFunction = hashHelper._getFileNameProcessor(fileNames, basePath);
      expect(typeof processorFunction).toEqual('function');
    });

    describe('processor function', () => {
      utils.fsStatAsync.mockImplementation(fileName => Promise.resolve({ isFile: () => fileName.includes('file') }));

      test('gathers stats for given file', done => {
        const fileName = fileNames[0];
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValue();
        const processorFunction = hashHelper._getFileNameProcessor(basePath, {});
        processorFunction(fileName)
          .then(() => {
            expect(utils.fsStatAsync).toBeCalledTimes(1);
            hashHelper._computeFileHash.mockRestore();
            done();
          })
          .catch(e => {
            hashHelper._computeFileHash.mockRestore();
            done(e);
          });
      });

      test('computes file hash', done => {
        const fileName = fileNames[0];
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValue(fileName);
        const processorFunction = hashHelper._getFileNameProcessor(basePath, {});
        processorFunction(fileName)
          .then(() => {
            expect(hashHelper._computeFileHash).toBeCalledTimes(1);
            expect(hashHelper._computeFileHash).toBeCalledWith(path.join(basePath, fileName));
            hashHelper._computeFileHash.mockRestore();
            done();
          })
          .catch(e => {
            hashHelper._computeFileHash.mockRestore();
            done(e);
          });
      });

      test('omits folders', done => {
        const fileName = fileNames[1];
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValue();
        const processorFunction = hashHelper._getFileNameProcessor(basePath, {});
        processorFunction(fileName)
          .then(() => {
            expect(hashHelper._computeFileHash).toBeCalledTimes(0);
            hashHelper._computeFileHash.mockRestore();
            done();
          })
          .catch(e => {
            hashHelper._computeFileHash.mockRestore();
            done(e);
          });
      });

      test('fills map with values', done => {
        const resultMap = {};
        const fileName = fileNames[0];
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValueOnce(Buffer.from(fileName));
        const processorFunction = hashHelper._getFileNameProcessor(basePath, resultMap);
        Promise.all(fileNames.map(processorFunction))
          .then(() => {
            expect(Object.keys(resultMap).length).toEqual(1);
            expect(resultMap[fileName]).toEqual({
              eTag: `"${Buffer.from(fileName).toString('hex')}"`,
              contentMD5: `${Buffer.from(fileName).toString('base64')}`,
            });
            hashHelper._computeFileHash.mockRestore();
            done();
          })
          .catch(e => {
            hashHelper._computeFileHash.mockRestore();
            done(e);
          });
      });
    });
  });

  describe('computeLocalFilesStats', () => {
    const fileNames = ['/folder1/file1', '/folder1/file2', '/folder1', ''];
    const basePath = '/home/website';
    const concurrency = 10;
    utils.parallel.mockResolvedValue();

    test('processes files in parallel ', done => {
      const stubFunction = () => {
      };
      jest.spyOn(hashHelper, '_getFileNameProcessor').mockImplementation(() => stubFunction);
      co(hashHelper.computeLocalFilesStats(fileNames, basePath, concurrency))
        .then(() => {
          expect(hashHelper._getFileNameProcessor).toBeCalledTimes(1);
          expect(utils.parallel).toBeCalledTimes(1);
          expect(utils.parallel.mock.calls[0][0]).toEqual(fileNames);
          expect(utils.parallel.mock.calls[0][1]).toEqual(stubFunction);
          expect(utils.parallel.mock.calls[0][2]).toEqual(concurrency);
          hashHelper._getFileNameProcessor.mockRestore();
          done();
        })
        .catch(e => {
          hashHelper._getFileNameProcessor.mockRestore();
          done(e);
        });
    });
  });
});
