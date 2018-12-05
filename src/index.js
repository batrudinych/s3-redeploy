'use strict';

const aws = require('aws-sdk');
const co = require('co');
const path = require('path');

const s3Helper = require('./lib/s3-helper');
const { processParams } = require('./lib/args-processor');
const { invalidate } = require('./lib/cf-helper');
const { globAsync, configureAwsSdk } = require('./lib/utils');
const { computeLocalFilesStats, detectFileChanges } = require('./lib/hash-helper');
const { CommonError } = require('./lib/errors');

const applyGlobPattern = function* (params, cwd) {
  console.log('Applying glob pattern, base path is:', cwd);
  let globResult;
  try {
    globResult = yield globAsync(params.pattern, { cwd });
  } catch (e) {
    throw new CommonError('Search files by glob operation failed', { cause: e });
  }
  console.log('Complete');

  return globResult
    .map(p => path.relative(cwd, path.resolve(cwd, p)))
    .filter(Boolean);
};

const computeLocalHashesMap = function* (fileNames, basePath, concurrency) {
  console.log('Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, basePath, concurrency);
  } catch (e) {
    throw new CommonError('Local files hash map computation failed', { cause: e });
  }
  const localFilesAmount = Object.keys(localHashesMap).length;
  console.log('Complete. Found', localFilesAmount, 'files locally');
  return localHashesMap;
};

const computeRemoteHashesMap = function* (s3HelperInstance) {
  console.log('Computing map of hashes for S3-stored files');
  let remoteHashesMap;
  try {
    remoteHashesMap = yield s3HelperInstance.getRemoteFilesStats();
  } catch (e) {
    throw new CommonError('Remote files hash map retrieval / computation failed', { cause: e });
  }
  const remoteFilesAmount = Object.keys(remoteHashesMap).length;
  console.log('Complete. Found', remoteFilesAmount, 'files in S3');
  return remoteHashesMap;
};

const removeExcessFiles = function* (s3HelperInstance, toDelete) {
  const removalNeeded = Object.keys(toDelete).length;
  if (removalNeeded) {
    console.log('%s files to be removed. Removing files', removalNeeded);
    try {
      yield s3HelperInstance.deleteObjects(toDelete);
    } catch (e) {
      throw new CommonError('Files removal failed', { cause: e });
    }
    console.log('Complete');
  } else {
    console.log('No files to be removed');
  }
};

const storeHashesMapToS3 = function* (s3HelperInstance, localHashesMap) {
  console.log('Saving map of file hashes');
  try {
    yield s3HelperInstance.storeRemoteHashesMap(localHashesMap);
  } catch (e) {
    throw new CommonError('Files hash map uploading failed', { cause: e });
  }
  console.log('Complete');
};

const invalidateCFDistribution = function* (cfClient, { cfDistId, cdInvPaths }) {
  console.log('Creating CloudFront invalidation for', cfDistId);
  let invalidateResponse;
  try {
    invalidateResponse = yield invalidate(cfClient, cfDistId, cdInvPaths);
  } catch (e) {
    throw new CommonError('CloudFront invalidation creation failed', { cause: e });
  }
  const invalidationId = invalidateResponse.Invalidation.Id;
  console.log('Complete. CloudFront invalidation created:', invalidationId);
  return invalidateResponse;
};

const uploadObjectsToS3 = function* (s3HelperInstance, toUpload, basePath) {
  const uploadNeeded = Object.keys(toUpload).length;
  if (uploadNeeded) {
    console.log('%s files to be uploaded. Uploading files', uploadNeeded);
    try {
      yield s3HelperInstance.uploadObjects(toUpload, basePath);
    } catch (e) {
      throw new CommonError('Files uploading failed', { cause: e });
    }
    console.log('Complete');
  } else {
    console.log('No files to be uploaded');
  }
};

module.exports = co.wrap(function* (params) {
  const paramsObj = processParams(params);
  console.log('Execution starts with the following params:');
  console.log(JSON.stringify(paramsObj, null, 2));

  const basePath = path.resolve(process.cwd(), paramsObj.cwd);

  const fileNames = yield applyGlobPattern(paramsObj, basePath);

  if (!fileNames.length) {
    console.log('Found no files to process. Exit');
    return null;
  }

  configureAwsSdk(aws, paramsObj);
  const s3Client = new aws.S3();
  const s3HelperInstance = s3Helper.getInstance(s3Client, paramsObj);

  const localHashesMap = yield computeLocalHashesMap(fileNames, basePath, paramsObj.concurrency);

  const remoteHashesMap = yield computeRemoteHashesMap(s3HelperInstance);

  console.log('Computing difference');
  const { toUpload, toDelete } = detectFileChanges(localHashesMap, remoteHashesMap);

  yield uploadObjectsToS3(s3HelperInstance, toUpload, basePath);

  if (!paramsObj.noRm) {
    yield removeExcessFiles(s3HelperInstance, toDelete);
  } else {
    console.log('Skipping removal as correspondent flag is set');
    if (!paramsObj.noMap) {
      Object.assign(localHashesMap, toDelete);
    }
  }

  if (!paramsObj.noMap) {
    yield storeHashesMapToS3(s3HelperInstance, localHashesMap);
  }

  if (paramsObj.cfDistId) {
    yield invalidateCFDistribution(new aws.CloudFront(), paramsObj);
  }
});
