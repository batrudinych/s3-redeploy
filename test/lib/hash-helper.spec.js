'use strict';

const co = require('co');
const crypto = require('crypto');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const stream = require('stream');
const utils = require('../../src/lib/utils');
const hashHelper = require('../../src/lib/hash-helper');

jest.mock('../../src/lib/utils');

describe('Hash helper', () => {
  describe('computeFileHash', () => {
    test('resolves with MD5 hash of non-gzipped file', done => {
      hashHelper._computeFileHash(__filename, false)
        .then(hash => {
          const data = fs.readFileSync(__filename);
          const syncHash = crypto.createHash('md5').update(data).digest();
          expect(hash).toEqual(syncHash);
          done();
        })
        .catch(done);
    });

    test('resolves with MD5 hash of gzipped file', done => {
      utils.gzipStream.mockImplementation(stream => stream.pipe(zlib.createGzip()));
      hashHelper._computeFileHash(__filename, true)
        .then(hash => {
          const data = fs.readFileSync(__filename);
          const gzippedData = zlib.gzipSync(data);
          const syncHash = crypto.createHash('md5').update(gzippedData).digest();
          expect(hash).toEqual(syncHash);
          done();
        })
        .catch(done);
    });

    test('rejects on error during reading', done => {
      const streamMock = new stream.Readable();
      streamMock._read = () => {
      };
      jest.spyOn(fs, 'createReadStream').mockReturnValue(streamMock);

      setImmediate(() => streamMock.emit('error', new Error('Example error')));
      hashHelper._computeFileHash(__filename)
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual('Example error');
          done();
        });
    });

    test('closes read stream, ends hash stream on error while piping (gzip) and rejects', done => {
      const readStreamMock = new stream.Readable();
      readStreamMock._read = () => {
      };
      readStreamMock.close = jest.fn();
      jest.spyOn(fs, 'createReadStream').mockReturnValue(readStreamMock);
      const endSpy = jest.spyOn(stream.Transform.prototype, 'end');
      const streamMock = new stream.Transform();
      streamMock._read = () => {
      };
      streamMock._write = () => {
      };
      utils.gzipStream.mockReturnValue(streamMock);
      setImmediate(() => streamMock.emit('error', new Error('Example error')));
      hashHelper._computeFileHash(__filename, true)
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual('Example error');
          expect(readStreamMock.close).toBeCalledTimes(1);
          expect(endSpy).toBeCalledTimes(1);
          done();
        });
    });

    test('closes read stream, ends hash stream on error while piping (hash) and rejects', done => {
      const readStreamMock = new stream.Readable();
      readStreamMock._read = () => {
      };
      readStreamMock.close = jest.fn();
      jest.spyOn(fs, 'createReadStream').mockReturnValue(readStreamMock);
      const endSpy = jest.spyOn(stream.Transform.prototype, 'end');
      const streamMock = new stream.Transform();
      streamMock._read = () => {
      };
      streamMock._write = () => {
      };
      jest.spyOn(crypto, 'createHash').mockReturnValue(streamMock);
      setImmediate(() => streamMock.emit('error', new Error('Example error')));
      hashHelper._computeFileHash(__filename)
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e.message).toEqual('Example error');
          expect(readStreamMock.close).toBeCalledTimes(1);
          expect(endSpy).toBeCalledTimes(1);
          done();
        });
    });
  });

  describe('getFileNameProcessor', () => {
    const fileNames = ['/folder1/file1.html', '/folder1.txt', ''];
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
        const gzip = false;
        utils.shouldGzip.mockReturnValue(gzip);
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValue(fileName);
        const processorFunction = hashHelper._getFileNameProcessor(basePath, {}, gzip);
        processorFunction(fileName)
          .then(() => {
            expect(hashHelper._computeFileHash).toBeCalledTimes(1);
            expect(hashHelper._computeFileHash).toBeCalledWith(path.join(basePath, fileName), gzip);
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
        const gzip = ['html'];
        jest.spyOn(hashHelper, '_computeFileHash').mockResolvedValueOnce(Buffer.from(fileName));
        const processorFunction = hashHelper._getFileNameProcessor(basePath, resultMap, gzip);
        utils.shouldGzip.mockImplementation(path => gzip.includes(path.substring(path.indexOf('.') + 1)));
        Promise.all(fileNames.map(processorFunction))
          .then(() => {
            expect(Object.keys(resultMap).length).toEqual(1);
            expect(resultMap[fileName]).toEqual({
              eTag: `"${Buffer.from(fileName).toString('hex')}"`,
              contentMD5: `${Buffer.from(fileName).toString('base64')}`,
              gzip: fileName.includes(gzip[0]),
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
      jest.spyOn(hashHelper, '_getFileNameProcessor').mockReturnValue(stubFunction);
      co(hashHelper.computeLocalFilesStats(fileNames, { basePath, concurrency }))
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
