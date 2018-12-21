'use strict';

const path = require('path');
const aws = require('aws-sdk');

const main = require('../src');
const { getInstance } = require('../src/lib/s3-helper');
const { isMetaChanged } = require('../src/lib/utils');
const {
  uploadObjectsToS3,
  storeHashesMapToS3,
  removeExcessFiles,
  invalidateCFDistribution,
  computeRemoteHashesMap,
  computeLocalHashesMap,
  applyGlobPattern,
  detectFileChanges,
  configureAwsSdk,
} = require('../src/steps');
const { processParams } = require('../src/lib/args-processor');
const logger = require('../src/lib/logger');

jest.mock('aws-sdk');
jest.mock('../src/lib/args-processor');
jest.mock('../src/steps');
jest.mock('../src/lib/s3-helper');
jest.mock('../src/lib/utils');
jest.mock('../src/lib/logger', () => ({
  init: jest.fn().mockReturnValue({
    info: jest.fn(),
    verbose: jest.fn(),
    error: jest.fn(),
  }),
  get: jest.fn().mockReturnValue({
    info: jest.fn(),
    verbose: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Main', () => {
  let params;
  const s3ClienStub = {
    method: () => {
    },
  };
  const s3HelperInstance = {
    method: () => {
    },
  };
  beforeEach(() => {
    params = {
      bucket: 'bucket-name',
      pattern: 'folder/**',
      cwd: './home',
    };
    aws.S3.mockImplementation(function() {
      return s3ClienStub;
    });
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue([]);
    configureAwsSdk.mockReturnValue(aws);
    getInstance.mockReturnValue(s3HelperInstance);
    computeLocalHashesMap.mockResolvedValue({});
    computeRemoteHashesMap.mockResolvedValue({});
    detectFileChanges.mockReturnValue({ changed: {}, removed: {} });
    uploadObjectsToS3.mockResolvedValue();
    removeExcessFiles.mockResolvedValue();
    storeHashesMapToS3.mockResolvedValue();
    invalidateCFDistribution.mockResolvedValue();
  });

  test('uses passed logger', done => {
    main({}, logger.init())
      .then(() => {
        expect(logger.init).toBeCalledTimes(1);
        done();
      })
      .catch(done);
  });

  test('initializes verbose logger', done => {
    params.verbose = true;
    main()
      .then(() => {
        expect(logger.init).toBeCalledTimes(1);
        expect(logger.init).toBeCalledWith({ level: 'verbose' });
        done();
      })
      .catch(done);
  });

  test('returns null if no files found by glob', done => {
    main()
      .then(result => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(0);
        expect(getInstance).toBeCalledTimes(0);
        expect(aws.S3).toBeCalledTimes(0);
        expect(computeLocalHashesMap).toBeCalledTimes(0);
        expect(computeRemoteHashesMap).toBeCalledTimes(0);
        expect(detectFileChanges).toBeCalledTimes(0);
        expect(uploadObjectsToS3).toBeCalledTimes(0);
        expect(removeExcessFiles).toBeCalledTimes(0);
        expect(storeHashesMapToS3).toBeCalledTimes(0);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        expect(result).toEqual(null);
        done();
      })
      .catch(done);
  });

  test('performs computations, updates bucket state and stores map to S3', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { hashes: { entry1: 'value1' }, params };
    const remoteHM = { hashes: { entry2: 'value2' }, params };
    const changed = { entry3: 'value3' };
    const removed = { entry4: 'value4' };
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ changed, removed });
    isMetaChanged.mockReturnValue(false);
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(s3HelperInstance, params);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, changed, params);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(s3HelperInstance, removed);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(s3HelperInstance, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('performs computations, uploads all local files and stores map to S3', done => {
    const fileNames = ['/folder/file1'];
    const paramsWithChangedMeta = Object.assign({}, params, { gzip: !params.gzip, cache: (params.cache || 0) + 1 });
    const localHM = { hashes: { entry1: 'value1' }, params };
    const remoteHM = { hashes: { entry2: 'value2' }, params: paramsWithChangedMeta };
    const changed = { entry3: 'value3' };
    const removed = { entry4: 'value4' };
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ changed, removed });
    isMetaChanged.mockReturnValue(true);
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(s3HelperInstance, params);
        expect(isMetaChanged).toBeCalledTimes(1);
        expect(isMetaChanged).toBeCalledWith(params, paramsWithChangedMeta);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, localHM, params);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(s3HelperInstance, removed);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(s3HelperInstance, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--no-map --no-rm: performs no computations, uploads all local files', done => {
    const fileNames = ['/folder/file1'];
    const paramsWithNoMapNoRM = Object.assign({ noRm: true, noMap: true }, params);
    const localHM = { hashes: { entry1: 'value1' }, params: paramsWithNoMapNoRM };
    processParams.mockReturnValue(paramsWithNoMapNoRM);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    isMetaChanged.mockReturnValue(false);
    main()
      .then(() => {
        expect(paramsWithNoMapNoRM.basePath).toEqual(path.resolve(process.cwd(), paramsWithNoMapNoRM.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(paramsWithNoMapNoRM);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(paramsWithNoMapNoRM);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, paramsWithNoMapNoRM);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, paramsWithNoMapNoRM);
        expect(computeRemoteHashesMap).toBeCalledTimes(0);
        expect(detectFileChanges).toBeCalledTimes(0);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, localHM, paramsWithNoMapNoRM);
        expect(removeExcessFiles).toBeCalledTimes(0);
        expect(storeHashesMapToS3).toBeCalledTimes(0);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--no-rm: removes no files remotely and updates hashes map', done => {
    const fileNames = ['/folder/file1'];
    const paramsWithNoRm = Object.assign({ noRm: true }, params);
    const localHM = { hashes: { entry1: 'value1' }, params: paramsWithNoRm };
    const remoteHM = { hashes: { entry2: 'value2' }, params };
    const changed = { hashes: { entry1: 'value1' } };
    const removed = { hashes: { entry2: 'value2' } };
    const resMap = { hashes: Object.assign({}, changed.hashes, removed.hashes), params: paramsWithNoRm };
    params.noRm = true;
    processParams.mockReturnValue(paramsWithNoRm);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ changed, removed });
    isMetaChanged.mockReturnValue(false);
    main()
      .then(() => {
        expect(paramsWithNoRm.basePath).toEqual(path.resolve(process.cwd(), paramsWithNoRm.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(paramsWithNoRm);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(paramsWithNoRm);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, paramsWithNoRm);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, paramsWithNoRm);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(s3HelperInstance, paramsWithNoRm);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, changed, paramsWithNoRm);
        expect(removeExcessFiles).toBeCalledTimes(0);
        expect(localHM).toEqual(resMap);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(s3HelperInstance, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--no-map: stores no map', done => {
    const fileNames = ['/folder/file1'];
    const paramsWithNoMap = Object.assign({ noMap: true }, params);
    const localHM = { hashes: { entry1: 'value1' }, params: paramsWithNoMap };
    const remoteHM = { hashes: { entry2: 'value2' }, params };
    const changed = { hashes: { entry1: 'value1' } };
    const removed = { hashes: { entry2: 'value2' } };
    const resMap = { hashes: changed.hashes, params: paramsWithNoMap };
    params.noRm = true;
    processParams.mockReturnValue(paramsWithNoMap);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ changed, removed });
    isMetaChanged.mockReturnValue(false);
    main()
      .then(() => {
        expect(paramsWithNoMap.basePath).toEqual(path.resolve(process.cwd(), paramsWithNoMap.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(paramsWithNoMap);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(paramsWithNoMap);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, paramsWithNoMap);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, paramsWithNoMap);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(s3HelperInstance, paramsWithNoMap);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, changed, paramsWithNoMap);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(s3HelperInstance, removed);
        expect(localHM).toEqual(resMap);
        expect(storeHashesMapToS3).toBeCalledTimes(0);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--cf-dist-id: creates an invalidation', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { hashes: { entry1: 'value1' }, params };
    const remoteHM = { hashes: { entry2: 'value2' }, params };
    const changed = { hashes: { entry3: 'value3' } };
    const removed = { hashes: { entry4: 'value4' } };
    const cfClienStub = {
      method: () => {
      },
    };
    aws.CloudFront.mockImplementation(function() {
      return cfClienStub;
    });
    params.cfDistId = true;
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ changed, removed });
    isMetaChanged.mockReturnValue(false);
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(s3HelperInstance, params);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(s3HelperInstance, changed, params);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(s3HelperInstance, removed);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(s3HelperInstance, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(1);
        expect(invalidateCFDistribution).toBeCalledWith(cfClienStub, params);
        done();
      })
      .catch(done);
  });
});
