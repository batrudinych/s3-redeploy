'use strict';

const path = require('path');
const aws = require('aws-sdk');
const { invalidate } = require('./lib/cf-helper');
const { globAsync } = require('./lib/utils');
const { computeLocalFilesStats } = require('./lib/hash-helper');
const { CommonError } = require('./lib/errors');

/**
 * Search for file system objects by glob pattern and return all the file names
 * relative to base path
 * @param basePath
 * @param pattern
 * @returns {Array}
 */
module.exports.applyGlobPattern = function* ({ basePath, pattern }) {
  console.log('Applying glob pattern, base path is:', basePath);
  let globResult;
  try {
    globResult = yield globAsync(pattern, { cwd: basePath });
  } catch (e) {
    throw new CommonError('Search files by glob operation failed', e);
  }
  console.log('Complete');

  return globResult
    .map(p => path.relative(basePath, path.resolve(basePath, p)))
    .filter(Boolean);
};

/**
 * Remove deleted locally files from S3
 * @param s3HelperInstance
 * @param toDelete - Map of files to delete
 */
module.exports.removeExcessFiles = function* (s3HelperInstance, toDelete) {
  const removalNeeded = Object.keys(toDelete).length;
  if (removalNeeded) {
    console.log('%s files to be removed. Removing files', removalNeeded);
    try {
      yield s3HelperInstance.deleteObjects(toDelete);
    } catch (e) {
      throw new CommonError('Files removal failed', e);
    }
    console.log('Complete');
  } else {
    console.log('No files to be removed');
  }
};

/**
 * Upload map with file hashes to S3
 * @param s3HelperInstance
 * @param localHashesMap
 */
module.exports.storeHashesMapToS3 = function* (s3HelperInstance, localHashesMap) {
  console.log('Saving map of file hashes');
  try {
    yield s3HelperInstance.storeRemoteHashesMap(localHashesMap);
  } catch (e) {
    throw new CommonError('Files hash map uploading failed', e);
  }
  console.log('Complete');
};

/**
 * Create an invalidation for a given distribution and paths through the
 * given CloudFront client instance
 * @param cfClient
 * @param cfDistId
 * @param cfInvPaths
 * @returns {*}
 */
module.exports.invalidateCFDistribution = function* (cfClient, { cfDistId, cfInvPaths }) {
  console.log('Creating CloudFront invalidation for', cfDistId);
  let invalidateResponse;
  try {
    invalidateResponse = yield invalidate(cfClient, cfDistId, cfInvPaths);
  } catch (e) {
    throw new CommonError('CloudFront invalidation creation failed', e);
  }
  const invalidationId = invalidateResponse.Invalidation.Id;
  console.log('Complete-> CloudFront invalidation created:', invalidationId);
  return invalidateResponse;
};

/**
 * Upload local file system objects to S3 using given map of hashes and S3 helper instance
 * @param s3HelperInstance
 * @param toUpload
 * @param basePath
 */
module.exports.uploadObjectsToS3 = function* (s3HelperInstance, toUpload, { basePath }) {
  const uploadNeeded = Object.keys(toUpload).length;
  if (uploadNeeded) {
    console.log('%s files to be uploaded. Uploading files', uploadNeeded);
    try {
      yield s3HelperInstance.uploadObjects(toUpload, basePath);
    } catch (e) {
      throw new CommonError('Files uploading failed', e);
    }
    console.log('Complete');
  } else {
    console.log('No files to be uploaded');
  }
};

/**
 * Calculate the difference between remote and local maps of file hashes
 * @param localHashesMap - A map of file hashes of locally stored files
 * @param remoteHashesMap - A map of file hashes of files stored in S3
 * @returns {{toUpload: {Object}, toDelete: {Object}}} - Object, containing
 * maps of file hashes to be uploaded and deleted correspondingly
 */
module.exports.detectFileChanges = (localHashesMap, remoteHashesMap) => {
  const remoteMapCopy = Object.assign({}, remoteHashesMap);
  const toUpload = {};
  for (const key of Object.keys(localHashesMap)) {
    const remoteFileData = remoteMapCopy[key];
    if (remoteFileData) {
      delete remoteMapCopy[key];
      if (remoteFileData.eTag !== localHashesMap[key].eTag) {
        toUpload[key] = localHashesMap[key];
      }
    } else {
      toUpload[key] = localHashesMap[key];
    }
  }
  return { toUpload, toDelete: remoteMapCopy };
};

/**
 * Configure AWS SDK instance based on input params and return it
 * @param params
 * @returns {{AWS SDK instance}}
 */
module.exports.configureAwsSdk = params => {
  const awsOptions = {
    sslEnabled: true,
    region: params.region,
  };
  aws.config.update(awsOptions);
  if (params.profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: params.profile });
  }
  return aws;
};

/**
 * Compute map of file hashes for locally stored files
 * @param fileNames
 * @param basePath
 * @param concurrency
 * @returns {Object}
 */
module.exports.computeLocalHashesMap = function* (fileNames, { basePath, concurrency }) {
  console.log('Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, basePath, concurrency);
  } catch (e) {
    throw new CommonError('Local files hash map computation failed', e);
  }
  const localFilesAmount = Object.keys(localHashesMap).length;
  console.log('Complete-> Found', localFilesAmount, 'files locally');
  return localHashesMap;
};

/**
 * Compute map of file hashes for S3-stored files
 * @param s3HelperInstance
 * @returns {*}
 */
module.exports.computeRemoteHashesMap = function* (s3HelperInstance) {
  console.log('Computing map of hashes for S3-stored files');
  let remoteHashesMap;
  try {
    remoteHashesMap = yield s3HelperInstance.getRemoteFilesStats();
  } catch (e) {
    throw new CommonError('Remote files hash map retrieval / computation failed', e);
  }
  const remoteFilesAmount = Object.keys(remoteHashesMap).length;
  console.log('Complete-> Found', remoteFilesAmount, 'files in S3');
  return remoteHashesMap;
};
