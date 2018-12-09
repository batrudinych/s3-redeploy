'use strict';

const path = require('path');

jest.mock('aws-sdk');
jest.mock('../src/lib/args-processor');
jest.mock('../src/steps');
jest.mock('../src/lib/s3-helper');

const main = require('../src');
const aws = require('aws-sdk');
const { getInstance } = require('../src/lib/s3-helper');
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

describe('Main', () => {
  let params;

  beforeEach(() => {
    params = {
      bucket: 'bucket-name',
      pattern: 'folder/**',
      cwd: './home',
    };
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue([]);
    configureAwsSdk.mockReturnValue(aws);
    getInstance.mockReturnValue(aws);
    computeLocalHashesMap.mockResolvedValue({});
    computeRemoteHashesMap.mockResolvedValue({});
    detectFileChanges.mockReturnValue({ toUpload: {}, toDelete: {} });
    uploadObjectsToS3.mockResolvedValue();
    removeExcessFiles.mockResolvedValue();
    storeHashesMapToS3.mockResolvedValue();
    invalidateCFDistribution.mockResolvedValue();
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

  test('performs computations, updates bucket state and stores file to S3', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { entry1: 'value1' };
    const remoteHM = { entry2: 'value2' };
    const toUpload = { entry3: 'value3'};
    const toDelete = { entry4: 'value4'};
    const s3ClienStub = {
      method: () => {
      },
    };
    aws.S3.mockImplementation(function() {
      return s3ClienStub;
    });
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ toUpload, toDelete });
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(getInstance).toBeCalledTimes(1);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(aws);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(aws, toUpload, params);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(aws, toDelete);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(aws, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--no-rm: removes no files remotely and updates hashes map', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { entry1: 'value1' };
    const remoteHM = { entry2: 'value2' };
    const toUpload = { entry1: 'value1'};
    const toDelete = { entry2: 'value2'};
    const resMap = Object.assign({}, toUpload, toDelete);
    const s3ClienStub = {
      method: () => {
      },
    };
    aws.S3.mockImplementation(function() {
      return s3ClienStub;
    });
    params.noRm = true;
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ toUpload, toDelete });
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(getInstance).toBeCalledTimes(1);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(aws);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(aws, toUpload, params);
        expect(removeExcessFiles).toBeCalledTimes(0);
        expect(localHM).toEqual(resMap);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(aws, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--no-rm --no-map: removes no files remotely and stores no map', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { entry1: 'value1' };
    const remoteHM = { entry2: 'value2' };
    const toUpload = { entry1: 'value1'};
    const toDelete = { entry2: 'value2'};
    const s3ClienStub = {
      method: () => {
      },
    };
    aws.S3.mockImplementation(function() {
      return s3ClienStub;
    });
    params.noRm = true;
    params.noMap = true;
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ toUpload, toDelete });
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(getInstance).toBeCalledTimes(1);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(aws);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(aws, toUpload, params);
        expect(removeExcessFiles).toBeCalledTimes(0);
        expect(storeHashesMapToS3).toBeCalledTimes(0);
        expect(invalidateCFDistribution).toBeCalledTimes(0);
        done();
      })
      .catch(done);
  });

  test('--cf-dist-id: creates an invalidation', done => {
    const fileNames = ['/folder/file1'];
    const localHM = { entry1: 'value1' };
    const remoteHM = { entry2: 'value2' };
    const toUpload = { entry3: 'value3'};
    const toDelete = { entry4: 'value4'};
    const s3ClienStub = {
      method: () => {
      },
    };
    const cfClienStub = {
      method: () => {
      },
    };
    aws.S3.mockImplementation(function() {
      return s3ClienStub;
    });
    aws.CloudFront.mockImplementation(function() {
      return cfClienStub;
    });
    params.cfDistId = true;
    processParams.mockReturnValue(params);
    applyGlobPattern.mockResolvedValue(fileNames);
    computeLocalHashesMap.mockResolvedValue(localHM);
    computeRemoteHashesMap.mockResolvedValue(remoteHM);
    detectFileChanges.mockReturnValue({ toUpload, toDelete });
    main()
      .then(() => {
        expect(params.basePath).toEqual(path.resolve(process.cwd(), params.cwd));
        expect(processParams).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledTimes(1);
        expect(applyGlobPattern).toBeCalledWith(params);
        expect(configureAwsSdk).toBeCalledTimes(1);
        expect(configureAwsSdk).toBeCalledWith(params);
        expect(getInstance).toBeCalledTimes(1);
        expect(aws.S3).toBeCalledTimes(1);
        expect(getInstance).toBeCalledWith(s3ClienStub, params);
        expect(computeLocalHashesMap).toBeCalledTimes(1);
        expect(computeLocalHashesMap).toBeCalledWith(fileNames, params);
        expect(computeRemoteHashesMap).toBeCalledTimes(1);
        expect(computeRemoteHashesMap).toBeCalledWith(aws);
        expect(detectFileChanges).toBeCalledTimes(1);
        expect(detectFileChanges).toBeCalledWith(localHM, remoteHM);
        expect(uploadObjectsToS3).toBeCalledTimes(1);
        expect(uploadObjectsToS3).toBeCalledWith(aws, toUpload, params);
        expect(removeExcessFiles).toBeCalledTimes(1);
        expect(removeExcessFiles).toBeCalledWith(aws, toDelete);
        expect(storeHashesMapToS3).toBeCalledTimes(1);
        expect(storeHashesMapToS3).toBeCalledWith(aws, localHM);
        expect(invalidateCFDistribution).toBeCalledTimes(1);
        expect(invalidateCFDistribution).toBeCalledWith(cfClienStub, params);
        done();
      })
      .catch(done);
  });
});
