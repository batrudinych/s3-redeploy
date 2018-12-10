'use strict';

const co = require('co');
const mime = require('mime');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const s3Helper = require('../../src/lib/s3-helper');
const utils = require('../../src/lib/utils');

jest.mock('../../src/lib/utils');

describe('S3 Helper', () => {
  const remoteMap = {
    entry1: 'value1',
  };
  const s3Mock = {
    getObject: jest.fn().mockReturnValue({
      promise: () => Promise.resolve({
        Body: Buffer.from(JSON.stringify(remoteMap)),
      }),
    }),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: () => Promise.resolve(),
    }),
    putObject: jest.fn().mockReturnValue({
      promise: () => Promise.resolve(),
    }),
    deleteObjects: jest.fn().mockReturnValue({
      promise: () => Promise.resolve(),
    }),
  };

  let params;
  beforeEach(() => {
    params = {
      bucket: 'bucket-name',
      ignoreMap: true,
      noMap: true,
      cache: 3600,
      gzip: true,
      fileName: 'file name',
      concurrency: 10,
    };
  });

  describe('getInstance', () => {
    test('returns a new instance of helper', () => {
      const s3Client = { method: 'stub' };
      const instance = s3Helper.getInstance(s3Client, params);
      expect(instance._ignoreMap).toEqual(params.ignoreMap || params.noMap);
      expect(instance._cache).toEqual(params.cache);
      expect(instance._gzip).toEqual(params.gzip);
      expect(instance._mapFileName).toEqual(params.fileName);
      expect(instance._concurrency).toEqual(params.concurrency);
      expect(instance._s3Client).toEqual(s3Client);
      expect(instance._s3BaseParams).toEqual({ Bucket: params.bucket });
    });
  });

  describe('deleteObjects', () => {
    test('removes objects from S3 in batches', done => {
      const maxBatchSize = 1000;
      const batchesCount = 2;
      const entriesCount = maxBatchSize * batchesCount;
      const toDelete = {};
      for (let i = 0; i < entriesCount; i++) {
        toDelete['entry' + i] = 'value' + i;
      }
      const allObjects = Object.keys(toDelete).map(Key => ({ Key }));
      const batches = [];
      for (let i = 0; i < batchesCount; i++) {
        batches.push(allObjects.slice(i * maxBatchSize, i * maxBatchSize + maxBatchSize));
      }
      utils.parallel.mockResolvedValue();
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.deleteObjects(toDelete)
        .then(() => {
          expect(utils.parallel).toBeCalledTimes(1);
          expect(utils.parallel.mock.calls[0][0]).toEqual(batches);
          expect(utils.parallel.mock.calls[0][2]).toEqual(params.concurrency);
          return utils.parallel.mock.calls[0][1](batches[0]);
        })
        .then(() => {
          expect(s3Mock.deleteObjects).toBeCalledTimes(1);
          expect(s3Mock.deleteObjects).toBeCalledWith({
            Bucket: params.bucket,
            Delete: {
              Objects: batches[0],
            },
          });
          done();
        })
        .catch(done);
    });
  });

  describe('uploadObjects', () => {
    test('uploads objects in parallel', done => {
      const instance = s3Helper.getInstance(s3Mock, params);
      utils.parallel.mockResolvedValue();
      jest.spyOn(instance, '_uploadObject').mockResolvedValue();
      const basePath = __dirname;
      const fileName = 'entry1';
      const toUpload = {
        entry1: 'value1',
        entry2: 'value2',
      };
      instance.uploadObjects(toUpload, basePath)
        .then(() => {
          expect(utils.parallel).toBeCalledTimes(1);
          expect(utils.parallel.mock.calls[0][0]).toEqual(Object.keys(toUpload));
          expect(utils.parallel.mock.calls[0][2]).toEqual(params.concurrency);
          return utils.parallel.mock.calls[0][1](fileName);
        })
        .then(() => {
          expect(instance._uploadObject).toBeCalledTimes(1);
          expect(instance._uploadObject).toBeCalledWith(fileName, toUpload[fileName], basePath);
          done();
        })
        .catch(done);
    });
  });

  describe('getRemoteHashesMap', () => {
    test('retrieves hashes map from S3', done => {
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.getRemoteHashesMap()
        .then(res => {
          expect(utils.gunzipAsync).toBeCalledTimes(0);
          expect(res).toEqual(remoteMap);
          done();
        })
        .catch(done);
    });

    test('retrieves hashes map from S3 and gunzips', done => {
      const body = Buffer.from(JSON.stringify(remoteMap));
      s3Mock.getObject = jest.fn().mockReturnValue({
        promise: () => Promise.resolve({
          ContentEncoding: 'gzip',
          Body: body,
        }),
      });
      utils.gunzipAsync.mockImplementation(data => Promise.resolve(data));
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.getRemoteHashesMap()
        .then(res => {
          expect(utils.gunzipAsync).toBeCalledTimes(1);
          expect(utils.gunzipAsync).toBeCalledWith(body);
          expect(res).toEqual(remoteMap);
          done();
        })
        .catch(done);
    });

    test('returns null if map does not exist', done => {
      s3Mock.getObject = jest.fn().mockReturnValue({
        promise: () => Promise.reject({
          statusCode: 404,
        }),
      });
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.getRemoteHashesMap()
        .then(res => {
          expect(res).toEqual(null);
          done();
        })
        .catch(done);
    });

    test('forwards non-404 S3 client errors', done => {
      s3Mock.getObject = jest.fn().mockReturnValue({
        promise: () => Promise.reject({
          statusCode: 500,
        }),
      });
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.getRemoteHashesMap()
        .then(() => {
          done(new Error('Should have thrown'));
        })
        .catch(e => {
          expect(e).toEqual({ statusCode: 500 });
          done();
        });
    });
  });

  describe('storeRemoteHashesMap', () => {
    test('uploads gzipped map of hashes to S3', done => {
      const map = {
        file1: {
          eTag: '"etag',
          contentMD5: 'md5',
        },
      };
      const buff = Buffer.from('buffer');
      utils.gzipAsync.mockResolvedValue(buff);
      const instance = s3Helper.getInstance(s3Mock, params);
      instance.storeRemoteHashesMap(map)
        .then(() => {
          expect(utils.gzipAsync).toBeCalledTimes(1);
          expect(utils.gzipAsync).toBeCalledWith(JSON.stringify(map));
          expect(s3Mock.putObject).toBeCalledTimes(1);
          expect(s3Mock.putObject).toBeCalledWith({
            Key: params.fileName,
            Body: buff,
            Bucket: params.bucket,
            ContentEncoding: 'gzip',
          });
          done();
        })
        .catch(done);
    });
  });

  describe('computeRemoteFilesStats', () => {
    test('builds map of hashes based on S3 ETags, skipping hashes map', done => {
      const instance = s3Helper.getInstance(s3Mock, params);
      const firstListResponse = {
        Contents: [{
          Key: 'firstKeyA',
          ETag: '"firstETagA"',
        }, {
          Key: params.fileName,
          ETag: '"firstETagB"',
        }],
        IsTruncated: true,
        NextContinuationToken: 'firstToken',
      };
      const secondListResponse = {
        Contents: [{
          Key: 'secondKey',
          ETag: '"secondETag"',
        }],
        IsTruncated: false,
        NextContinuationToken: 'secondToken',
      };
      const allItems = firstListResponse.Contents.concat(secondListResponse.Contents);
      const expectedMap = {};
      for (const item of allItems) {
        if (item.Key !== params.fileName) {
          expectedMap[item.Key] = {
            eTag: item.ETag,
            contentMD5: Buffer.from(item.ETag.slice(1, -1), 'hex').toString('base64'),
          };
        }
      }

      s3Mock.listObjectsV2 = jest.fn()
        .mockImplementationOnce(args => {
          expect(args).toEqual({ Bucket: params.bucket });
          return {
            promise: () => Promise.resolve(firstListResponse),
          };
        })
        .mockImplementationOnce(args => {
          expect(args).toEqual({
            Bucket: params.bucket,
            ContinuationToken: firstListResponse.NextContinuationToken,
          });
          return {
            promise: () => Promise.resolve(secondListResponse),
          };
        });
      co(function* () {
        const result = yield instance.computeRemoteFilesStats();
        expect(s3Mock.listObjectsV2).toBeCalledTimes(2);
        expect(result).toEqual(expectedMap);
      })
        .then(() => done())
        .catch(done);
    });
  });

  describe('_uploadObject', () => {
    test('fills basic metadata and uploads object to S3', done => {
      delete params.cache;
      const fileName = '/folder1/file1.txt';
      const fileData = {
        contentMD5: 'md5',
      };
      const streamMock = new stream.Readable();
      const basePath = __dirname;
      jest.spyOn(mime, 'getType').mockReturnValue();
      jest.spyOn(fs, 'createReadStream').mockReturnValue(streamMock);
      utils.shouldGzip.mockReturnValue();
      const instance = s3Helper.getInstance(s3Mock, params);
      instance._uploadObject(fileName, fileData, basePath)
        .then(() => {
          expect(s3Mock.putObject).toBeCalledTimes(1);
          expect(s3Mock.putObject).toBeCalledWith({
            Bucket: params.bucket,
            ACL: 'public-read',
            Key: fileName,
            Body: streamMock,
            ContentMD5: fileData.contentMD5,
          });
          expect(utils.shouldGzip).toBeCalledTimes(1);
          expect(utils.shouldGzip).toBeCalledWith(fileName, params.gzip);
          expect(mime.getType).toBeCalledTimes(1);
          expect(mime.getType).toBeCalledWith(fileName);
          expect(fs.createReadStream).toBeCalledTimes(1);
          expect(fs.createReadStream).toBeCalledWith(path.join(basePath, fileName));
          expect(utils.gzipStream).toBeCalledTimes(0);
          // fs.createReadStream.mockRestore();
          done();
        })
        .catch(done);
    });

    test('adds additional metadata and gzips data', done => {
      const fileName = '/folder1/file1.txt';
      const fileData = {
        contentMD5: 'md5',
      };
      const streamMock = new stream.Readable();
      const basePath = __dirname;
      const mimeType = 'mimeType';
      jest.spyOn(mime, 'getType').mockReturnValue(mimeType);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(streamMock);
      utils.shouldGzip.mockReturnValue(true);
      utils.gzipStream.mockReturnValue(streamMock);
      const instance = s3Helper.getInstance(s3Mock, params);
      instance._uploadObject(fileName, fileData, basePath)
        .then(() => {
          expect(s3Mock.putObject).toBeCalledTimes(1);
          expect(s3Mock.putObject).toBeCalledWith({
            Bucket: params.bucket,
            ACL: 'public-read',
            Key: fileName,
            Body: streamMock,
            ContentEncoding: 'gzip',
            ContentMD5: fileData.contentMD5,
            ContentType: mimeType,
            CacheControl: 'max-age=' + params.cache,
          });
          expect(utils.shouldGzip).toBeCalledTimes(1);
          expect(utils.shouldGzip).toBeCalledWith(fileName, params.gzip);
          expect(mime.getType).toBeCalledTimes(1);
          expect(mime.getType).toBeCalledWith(fileName);
          expect(fs.createReadStream).toBeCalledTimes(1);
          expect(fs.createReadStream).toBeCalledWith(path.join(basePath, fileName));
          expect(utils.gzipStream).toBeCalledTimes(1);
          expect(utils.gzipStream).toBeCalledWith(streamMock);
          done();
        })
        .catch(done);
    });
  });

  describe('getRemoteFilesStats', () => {
    test('--ignore-map: computes map of hashes', done => {
      const instance = s3Helper.getInstance({}, { ignoreMap: true });
      const stats = { entry1: 'value1' };
      jest.spyOn(instance, 'computeRemoteFilesStats').mockResolvedValue(stats);
      jest.spyOn(instance, 'getRemoteHashesMap');
      co(function* () {
        const res = yield instance.getRemoteFilesStats();
        expect(instance.computeRemoteFilesStats).toBeCalledTimes(1);
        expect(instance.getRemoteHashesMap).toBeCalledTimes(0);
        expect(res).toEqual(stats);
      })
        .then(() => done())
        .catch(done);
    });

    test('retrieves and returns map of hashes', done => {
      const instance = s3Helper.getInstance({}, {});
      const stats = { entry1: 'value1' };
      jest.spyOn(instance, 'getRemoteHashesMap').mockResolvedValue(stats);
      jest.spyOn(instance, 'computeRemoteFilesStats');
      co(function* () {
        const res = yield instance.getRemoteFilesStats();
        expect(instance.getRemoteHashesMap).toBeCalledTimes(1);
        expect(instance.computeRemoteFilesStats).toBeCalledTimes(0);
        expect(res).toEqual(stats);
      })
        .then(() => done())
        .catch(done);
    });

    test('computes map of hashes if no map found in S3', done => {
      const instance = s3Helper.getInstance({}, {});
      const stats = { entry1: 'value1' };
      jest.spyOn(instance, 'getRemoteHashesMap').mockResolvedValue();
      jest.spyOn(instance, 'computeRemoteFilesStats').mockResolvedValue(stats);
      co(function* () {
        const res = yield instance.getRemoteFilesStats();
        expect(instance.getRemoteHashesMap).toBeCalledTimes(1);
        expect(instance.computeRemoteFilesStats).toBeCalledTimes(1);
        expect(res).toEqual(stats);
      })
        .then(() => done())
        .catch(done);
    });
  });
});