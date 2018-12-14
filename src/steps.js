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
  console.log('▹ Applying glob pattern, base path is:', basePath);
  let globResult;
  try {
    globResult = yield globAsync(pattern, { cwd: basePath });
  } catch (e) {
    throw new CommonError('Search files by glob operation failed', e);
  }
  console.log('✓ Complete\n');

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
  const fileNames = Object.keys(toDelete);
  const filesAmount = fileNames.length;
  if (filesAmount) {
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    console.log('▹ %s files to be removed:', filesAmount);
    fileNames.forEach(n => console.log(n));
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    console.log('▹ Removing...');
    try {
      yield s3HelperInstance.deleteObjects(toDelete);
    } catch (e) {
      throw new CommonError('Files removal failed', e);
    }
    console.log('✓ Complete\n');
  } else {
    console.log('▹ No files to be removed\n');
  }
};

/**
 * Upload map with file hashes to S3
 * @param s3HelperInstance
 * @param localHashesMap
 */
module.exports.storeHashesMapToS3 = function* (s3HelperInstance, localHashesMap) {
  console.log('▹ Uploading map of file hashes');
  try {
    yield s3HelperInstance.storeRemoteHashesMap(localHashesMap);
  } catch (e) {
    throw new CommonError('Files hash map uploading failed', e);
  }
  console.log('✓ Complete\n');
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
  console.log('▹ Creating CloudFront invalidation for', cfDistId);
  let invalidateResponse;
  try {
    invalidateResponse = yield invalidate(cfClient, cfDistId, cfInvPaths);
  } catch (e) {
    throw new CommonError('CloudFront invalidation creation failed', e);
  }
  const invalidationId = invalidateResponse.Invalidation.Id;
  console.log('✓ Complete-> CloudFront invalidation created: %s\n', invalidationId);
  return invalidateResponse;
};

/**
 * Upload local file system objects to S3 using given map of hashes and S3 helper instance
 * @param s3HelperInstance
 * @param toUpload
 * @param basePath
 */
module.exports.uploadObjectsToS3 = function* (s3HelperInstance, toUpload, { basePath }) {
  const fileNames = Object.keys(toUpload);
  const filesAmount = fileNames.length;
  if (filesAmount) {
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    console.log('▹ %s files to be uploaded:', filesAmount);
    fileNames.forEach(n => console.log(n));
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    console.log('▹ Uploading...');
    try {
      yield s3HelperInstance.uploadObjects(toUpload, basePath);
    } catch (e) {
      throw new CommonError('Files uploading failed', e);
    }
    console.log('✓ Complete\n');
  } else {
    console.log('▹ No files to be uploaded\n');
  }
};

/**
 * Calculate the difference between remote and local maps of file hashes
 * @param localHashes - A map of file hashes of locally stored files
 * @param remoteHashes - A map of file hashes of files stored in S3
 * @returns {{changed: {Object}, removed: {Object}}} - Object, containing
 * maps of file hashes
 */
module.exports.detectFileChanges = (localHashes, remoteHashes) => {
  const remoteMapCopy = Object.assign({}, remoteHashes);
  const changed = {};
  for (const key of Object.keys(localHashes)) {
    const remoteFileData = remoteMapCopy[key];
    if (remoteFileData) {
      delete remoteMapCopy[key];
      if (remoteFileData.eTag !== localHashes[key].eTag) {
        changed[key] = localHashes[key];
      }
    } else {
      changed[key] = localHashes[key];
    }
  }
  return { changed, removed: remoteMapCopy };
};

/**
 * Configure AWS SDK instance based on input params and return it
 * @param params
 * @returns {{AWS SDK instance}}
 */
module.exports.configureAwsSdk = params => {
  console.log('▹ Configuring AWS SDK');
  const awsOptions = {
    sslEnabled: true,
    region: params.region,
  };
  aws.config.update(awsOptions);
  if (params.profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: params.profile });
  }
  console.log('✓ Complete\n');
  return aws;
};

/**
 * Compute map of file hashes for locally stored files
 * @param fileNames
 * @param params
 * @returns {Object}
 */
module.exports.computeLocalHashesMap = function* (fileNames, params) {
  console.log('▹ Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, params.basePath, params.concurrency);
  } catch (e) {
    throw new CommonError('Local files hash map computation failed', e);
  }
  const localFilesAmount = Object.keys(localHashesMap).length - 1;
  console.log('✓ Complete-> Found', localFilesAmount, 'files locally\n');
  return { hashes: localHashesMap, params };
};

/**
 * Compute map of file hashes for S3-stored files
 * @param s3HelperInstance
 * @param params
 * @returns {*}
 */
module.exports.computeRemoteHashesMap = function* (s3HelperInstance, params) {
  console.log('▹ Gathering map of hashes for S3-stored files...');
  let remoteHashesMap;
  try {
    const useNoMap = params.ignoreMap || params.noMap;
    if (!useNoMap) {
      console.log('  ▫ Retrieving map of hashes...');
      remoteHashesMap = yield s3HelperInstance.getRemoteHashesMap();
      if (!remoteHashesMap) {
        console.log('  × No map found');
      } else {
        console.log('  ✓ Map found');
      }
    }
    if (!remoteHashesMap) {
      console.log('  ▫ Computing map of hashes...');
      remoteHashesMap = {
        hashes: (yield s3HelperInstance.computeRemoteFilesStats()),
      };
      console.log('  ✓ Complete');
    }
  } catch (e) {
    throw new CommonError('Remote files hash map retrieval / computation failed', e);
  }
  const remoteFilesAmount = Object.keys(remoteHashesMap.hashes).length;
  console.log('✓ Complete-> Found', remoteFilesAmount, 'files in S3\n');
  return remoteHashesMap;
};
