'use strict';

const path = require('path');
const co = require('co');
const aws = require('aws-sdk');
const { CommonError } = require('../src/lib/errors');
const cfHelper = require('../src/lib/cf-helper');
const utils = require('../src/lib/utils');
const hashHelper = require('../src/lib/hash-helper');
const steps = require('../src/steps');

jest.mock('aws-sdk');
jest.mock('../src/lib/hash-helper');
jest.mock('../src/lib/utils');
jest.mock('../src/lib/cf-helper');
jest.mock('../src/lib/logger', () => ({
  init: () => ({
    info: console.log,
    verbose: console.log,
    error: console.log,
  }),
  get: () => ({
    info: console.log,
    verbose: console.log,
    error: console.log,
  }),
}));

describe('Steps', () => {
  describe('applyGlobPattern', () => {
    const basePath = __dirname;
    const pattern = 'pattern';
    test('calls for globAsync and maps result', done => {
      const globRes = [
        basePath,
        path.join(basePath, 'folder1/file1'),
        path.join(basePath, 'folder1/file2'),
      ];
      utils.globAsync.mockResolvedValue(globRes);
      co(function* () {
        const result = yield steps.applyGlobPattern({ basePath, pattern });
        expect(utils.globAsync).toBeCalledTimes(1);
        expect(utils.globAsync).toBeCalledWith(pattern, { cwd: basePath });
        expect(result).toEqual(globRes.slice(1).map(p => path.relative(basePath, p).replace(/\\/g, '/')));
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps errors from globAsync', done => {
      const error = new Error('Example error');
      utils.globAsync.mockRejectedValue(error);
      co(function* () {
        yield steps.applyGlobPattern({ basePath, pattern });
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(utils.globAsync).toBeCalledTimes(1);
          expect(utils.globAsync).toBeCalledWith(pattern, { cwd: basePath });
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Search files by glob operation failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('removeExcessFiles', () => {
    test('calls deleteObjects', done => {
      const toDelete = {
        hashes: {
          entry1: 'value1',
        },
      };
      const s3HelperInstance = {
        deleteObjects: jest.fn().mockResolvedValue(),
      };
      co(function* () {
        yield steps.removeExcessFiles(s3HelperInstance, toDelete);
        expect(s3HelperInstance.deleteObjects).toBeCalledTimes(1);
        expect(s3HelperInstance.deleteObjects).toBeCalledWith(Object.keys(toDelete.hashes));
      })
        .then(() => done())
        .catch(done);
    });

    test('does nothing if there is nothing to remove', done => {
      const toDelete = {
        hashes: {},
      };
      const s3HelperInstance = {
        deleteObjects: jest.fn().mockResolvedValue(),
      };
      co(function* () {
        yield steps.removeExcessFiles(s3HelperInstance, toDelete);
        expect(s3HelperInstance.deleteObjects).toBeCalledTimes(0);
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps deleteObjects errors', done => {
      const error = new Error('Example error');
      const toDelete = {
        hashes: {
          entry1: 'value1',
        },
      };
      const s3HelperInstance = {
        deleteObjects: jest.fn().mockRejectedValue(error),
      };
      co(function* () {
        yield steps.removeExcessFiles(s3HelperInstance, toDelete);
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(s3HelperInstance.deleteObjects).toBeCalledTimes(1);
          expect(s3HelperInstance.deleteObjects).toBeCalledWith(Object.keys(toDelete.hashes));
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Files removal failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('storeHashesMapToS3', () => {
    const localHashesMap = {
      hashes: {
        entry1: 'value1',
      },
      gzip: {
        entry1: true,
      },
      params: {},
    };
    test('calls storeRemoteHashesMap', done => {
      const s3HelperInstance = {
        storeRemoteHashesMap: jest.fn().mockResolvedValue(),
      };
      co(function* () {
        yield steps.storeHashesMapToS3(s3HelperInstance, localHashesMap);
        expect(s3HelperInstance.storeRemoteHashesMap).toBeCalledTimes(1);
        expect(s3HelperInstance.storeRemoteHashesMap).toBeCalledWith({
          hashes: localHashesMap.hashes,
          params: localHashesMap.params,
        });
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps errors', done => {
      const error = new Error('Example error');
      const s3HelperInstance = {
        storeRemoteHashesMap: jest.fn().mockRejectedValue(error),
      };
      co(function* () {
        yield steps.storeHashesMapToS3(s3HelperInstance, localHashesMap);
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(s3HelperInstance.storeRemoteHashesMap).toBeCalledTimes(1);
          expect(s3HelperInstance.storeRemoteHashesMap).toBeCalledWith({
            hashes: localHashesMap.hashes,
            params: localHashesMap.params,
          });
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Files hash map uploading failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('invalidateCFDistribution', () => {
    test('calls invalidate', done => {
      const cfDistId = 'cfDistId';
      const cfInvPaths = ['cfInvPath'];
      const cfClient = { entry: () => 'value' };
      cfHelper.invalidate.mockResolvedValue({
        Invalidation: {
          Id: 'id',
        },
      });
      co(function* () {
        yield steps.invalidateCFDistribution(cfClient, { cfDistId, cfInvPaths });
        expect(cfHelper.invalidate).toBeCalledTimes(1);
        expect(cfHelper.invalidate).toBeCalledWith(cfClient, cfDistId, cfInvPaths);
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps invalidate errors', done => {
      const error = new Error('Example error');
      const cfDistId = 'cfDistId';
      const cfInvPaths = ['cfInvPath'];
      const cfClient = { entry: () => 'value' };
      cfHelper.invalidate.mockRejectedValue(error);
      co(function* () {
        yield steps.invalidateCFDistribution(cfClient, { cfDistId, cfInvPaths });
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(cfHelper.invalidate).toBeCalledTimes(1);
          expect(cfHelper.invalidate).toBeCalledWith(cfClient, cfDistId, cfInvPaths);
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('CloudFront invalidation creation failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('uploadObjectsToS3', () => {
    const basePath = __dirname;
    test('calls uploadObjects', done => {
      const toUpload = {
        hashes: {
          entry1: 'value1',
        },
      };
      const s3HelperInstance = {
        uploadObjects: jest.fn().mockResolvedValue(),
      };
      co(function* () {
        yield steps.uploadObjectsToS3(s3HelperInstance, toUpload, { basePath });
        expect(s3HelperInstance.uploadObjects).toBeCalledTimes(1);
        expect(s3HelperInstance.uploadObjects).toBeCalledWith(toUpload, basePath);
      })
        .then(() => done())
        .catch(done);
    });

    test('does nothing if there is nothing to remove', done => {
      const toUpdate = {
        hashes: {},
      };
      const s3HelperInstance = {
        uploadObjects: jest.fn().mockResolvedValue(),
      };
      co(function* () {
        yield steps.uploadObjectsToS3(s3HelperInstance, toUpdate, { basePath });
        expect(s3HelperInstance.uploadObjects).toBeCalledTimes(0);
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps uploadObjects errors', done => {
      const error = new Error('Example error');
      const toUpdate = {
        hashes: {
          entry1: 'value1',
        },
      };
      const s3HelperInstance = {
        uploadObjects: jest.fn().mockRejectedValue(error),
      };
      co(function* () {
        yield steps.uploadObjectsToS3(s3HelperInstance, toUpdate, { basePath });
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(s3HelperInstance.uploadObjects).toBeCalledTimes(1);
          expect(s3HelperInstance.uploadObjects).toBeCalledWith(toUpdate, basePath);
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Files uploading failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('detectFileChanges', () => {
    test('computes difference based on hashes', () => {
      const localHashesMap = {
        hashes: {
          file1: 'hash1',
          file2: 'hash2',
          file3: 'hash3',
          file5: 'hash5',
          file6: 'hash6',
        },
        gzip: {
          file1: true,
          file3: true,
        },
      };
      const remoteHashesMap = {
        hashes: {
          file1: 'hash1-old',
          file2: 'hash2',
          file4: 'hash4',
          file5: 'hash5-old',
        },
      };
      const expectedChanged = {
        hashes: {
          file1: 'hash1',
          file3: 'hash3',
          file5: 'hash5',
          file6: 'hash6',
        },
        gzip: {
          file1: true,
          file3: true,
        },
      };
      const expectedRemoved = {
        hashes: {
          file4: 'hash4',
        },
      };
      const { changed, removed } = steps.detectFileChanges(localHashesMap, remoteHashesMap);
      expect(changed).toEqual(expectedChanged);
      expect(removed).toEqual(expectedRemoved);
    });
  });

  describe('configureAwsSdk', () => {
    test('sets region for aws sdk module', () => {
      const params = {
        region: 'awsRegion',
      };
      const expectedOptions = Object.assign({
        computeChecksums: true,
        sslEnabled: true,
      }, params);
      const configuredAws = steps.configureAwsSdk(params);
      expect(configuredAws).toEqual(aws);
      expect(configuredAws.config.update).toBeCalledTimes(1);
      expect(configuredAws.config.update).toBeCalledWith(expectedOptions);
    });

    test('sets S3 bucket param for aws sdk module', () => {
      const params = {
        bucket: 'bucket-name',
      };
      const configuredAws = steps.configureAwsSdk(params);
      expect(configuredAws).toEqual(aws);
      expect(configuredAws.config.s3).toEqual({ params: { Bucket: params.bucket } });
    });

    test('sets region and profile for aws sdk module', () => {
      const params = { region: 'awsRegion', profile: 'profile' };
      const expectedOptions = Object.assign({
        computeChecksums: true,
        sslEnabled: true,
      }, params);
      delete expectedOptions.profile;

      const sharedCredentialsMock = { cred: 'val' };
      aws.SharedIniFileCredentials.mockImplementation(function() {
        return sharedCredentialsMock;
      });
      const configuredAws = steps.configureAwsSdk(params);
      expect(configuredAws).toEqual(aws);
      expect(configuredAws.config.update).toBeCalledTimes(1);
      expect(configuredAws.config.update).toBeCalledWith(expectedOptions);
      expect(aws.SharedIniFileCredentials).toBeCalledTimes(1);
      expect(aws.SharedIniFileCredentials).toBeCalledWith({ profile: params.profile });
      expect(configuredAws.config.credentials).toEqual(sharedCredentialsMock);
    });
  });

  describe('computeLocalHashesMap', () => {
    const params = {
      basePath: __dirname,
      concurrency: 10,
    };
    const fileNames = ['file1', 'file2'];
    const localHashesMap = {
      hashes: fileNames.reduce((acc, val) => {
        acc[val] = 'hash' + val;
        return acc;
      }, {}),
    };

    test('calls computeLocalFilesStats', done => {
      hashHelper.computeLocalFilesStats.mockResolvedValue(localHashesMap);
      co(function* () {
        const result = yield steps.computeLocalHashesMap(fileNames, params);
        expect(hashHelper.computeLocalFilesStats).toBeCalledTimes(1);
        expect(hashHelper.computeLocalFilesStats).toBeCalledWith(fileNames, params);
        expect(result).toEqual(Object.assign({ params }, localHashesMap));
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps errors', done => {
      const error = new Error('Example error');
      hashHelper.computeLocalFilesStats.mockRejectedValue(error);
      co(function* () {
        yield steps.computeLocalHashesMap(fileNames, params);
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(hashHelper.computeLocalFilesStats).toBeCalledTimes(1);
          expect(hashHelper.computeLocalFilesStats).toBeCalledWith(fileNames, params);
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Local files hash map computation failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });

  describe('computeRemoteHashesMap', () => {
    test('calls getRemoteHashesMap', done => {
      const remoteHashesMap = {
        hashes: {
          entry1: {
            eTag: 'value1',
          },
        },
      };
      const s3HelperInstance = {
        getRemoteHashesMap: jest.fn().mockResolvedValue(remoteHashesMap),
      };
      co(function* () {
        const params = {};
        const result = yield steps.computeRemoteHashesMap(s3HelperInstance, params);
        expect(s3HelperInstance.getRemoteHashesMap).toBeCalledTimes(1);
        expect(s3HelperInstance.getRemoteHashesMap).toBeCalledWith();
        expect(result).toEqual(remoteHashesMap);
      })
        .then(() => done())
        .catch(done);
    });

    test('calls getRemoteHashesMap and computeRemoteFilesStats if no map found remotely', done => {
      const remoteHashesMap = {
        hashes: {
          entry1: {
            eTag: 'value1',
          },
        },
      };
      const s3HelperInstance = {
        getRemoteHashesMap: jest.fn().mockResolvedValue(),
        computeRemoteFilesStats: jest.fn().mockResolvedValue(remoteHashesMap.hashes),
      };
      co(function* () {
        const params = {};
        const result = yield steps.computeRemoteHashesMap(s3HelperInstance, params);
        expect(s3HelperInstance.getRemoteHashesMap).toBeCalledTimes(1);
        expect(s3HelperInstance.getRemoteHashesMap).toBeCalledWith();
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledTimes(1);
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledWith();
        expect(result).toEqual(remoteHashesMap);
      })
        .then(() => done())
        .catch(done);
    });

    test('--ignore-map: calls computeRemoteFilesStats', done => {
      const remoteHashesMap = {
        hashes: {
          entry1: {
            eTag: 'value1',
          },
        },
      };
      const s3HelperInstance = {
        computeRemoteFilesStats: jest.fn().mockResolvedValue(remoteHashesMap.hashes),
      };
      co(function* () {
        const params = { ignoreMap: true };
        const result = yield steps.computeRemoteHashesMap(s3HelperInstance, params);
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledTimes(1);
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledWith();
        expect(result).toEqual(remoteHashesMap);
      })
        .then(() => done())
        .catch(done);
    });

    test('--no-map: calls computeRemoteFilesStats', done => {
      const remoteHashesMap = {
        hashes: {
          entry1: {
            eTag: 'value1',
          },
        },
      };
      const s3HelperInstance = {
        computeRemoteFilesStats: jest.fn().mockResolvedValue(remoteHashesMap.hashes),
      };
      co(function* () {
        const params = { noMap: true };
        const result = yield steps.computeRemoteHashesMap(s3HelperInstance, params);
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledTimes(1);
        expect(s3HelperInstance.computeRemoteFilesStats).toBeCalledWith();
        expect(result).toEqual(remoteHashesMap);
      })
        .then(() => done())
        .catch(done);
    });

    test('wraps errors', done => {
      const error = new Error('Example error');
      const s3HelperInstance = {
        getRemoteHashesMap: jest.fn().mockRejectedValue(error),
      };
      co(function* () {
        yield steps.computeRemoteHashesMap(s3HelperInstance, {});
      })
        .then(() => done(new Error('Should have thrown')))
        .catch(e => {
          expect(s3HelperInstance.getRemoteHashesMap).toBeCalledTimes(1);
          expect(s3HelperInstance.getRemoteHashesMap).toBeCalledWith();
          expect(e instanceof CommonError).toEqual(true);
          expect(e.message).toEqual('Remote files hash map retrieval / computation failed');
          expect(e.originalError).toEqual(error);
          done();
        });
    });
  });
});
