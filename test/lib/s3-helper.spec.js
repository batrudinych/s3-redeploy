'use strict';

const co = require('co');
const s3Helper = require('../../src/lib/s3-helper');
const utils = require('../../src/lib/utils');

jest.mock('../../src/lib/utils');

describe('S3 Helper', () => {
  const s3Mock = {
    getObject: jest.fn().mockReturnValue({
      promise: () => Promise.resolve({
        ContentEncoding: 'gzip',
      }),
    }),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: () => Promise.resolve({
        Key: '',
        ETag: '',
        Contents: '',
        IsTruncated: '',
        NextContinuationToken: '',
      }),
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
    test('removes objects from S3 in batches', () => {

    });
  });

  describe('uploadObjects', () => {
    test('uploads objects in parallel', () => {

    });
  });

  describe('getRemoteHashesMap', () => {
    test('retrieves hashes map from S3', () => {

    });

    test('retrieves hashes map from S3 and gunzips', () => {

    });

    test('returns null if map does not exist', () => {

    });

    test('forwards non-404 S3 client errors', () => {

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
    test('builds map of hashes based on ETag', () => {

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

  describe('_uploadObject', () => {
    test('fills metadata and uploads objects to S3', () => {

    });
  });
});
