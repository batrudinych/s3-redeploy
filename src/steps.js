'use strict';

const path = require('path');
const aws = require('aws-sdk');
const { invalidate } = require('./lib/cf-helper');
const { globAsync } = require('./lib/utils');
const { computeLocalFilesStats } = require('./lib/hash-helper');
const { CommonError } = require('./lib/errors');
const logger = require('./lib/logger').get();

/**
 * Search for file system objects by glob pattern and return all the file names
 * relative to base path
 * @param basePath
 * @param pattern
 * @returns {Array}
 */
module.exports.applyGlobPattern = function* ({ basePath, pattern }) {
  logger.info('▹ Applying glob pattern, base path is:', basePath);
  let globResult;
  try {
    globResult = yield globAsync(pattern, { cwd: basePath });
  } catch (e) {
    throw new CommonError('Search files by glob operation failed', e);
  }
  logger.info('✓ Complete\n');

  return globResult
    .map(p => path.relative(basePath, path.resolve(basePath, p)).replace(/\\/g, '/'))
    .filter(Boolean);
};

/**
 * Remove deleted locally files from S3
 * @param s3HelperInstance
 * @param toDelete - Map of files to delete
 */
module.exports.removeExcessFiles = function* (s3HelperInstance, toDelete) {
  const fileNames = Object.keys(toDelete.hashes);
  const filesAmount = fileNames.length;
  if (filesAmount) {
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾');
    logger.info('▹ %s file(s) to be removed', filesAmount);
    fileNames.forEach(n => logger.verbose(n));
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    logger.info('▹ Removing');
    try {
      yield s3HelperInstance.deleteObjects(fileNames);
    } catch (e) {
      throw new CommonError('Files removal failed', e);
    }
    logger.info('✓ Complete\n');
  } else {
    logger.info('▹ No files to be removed\n');
  }
};

/**
 * Upload map with file hashes to S3
 * @param s3HelperInstance
 * @param localHashesMap
 */
module.exports.storeHashesMapToS3 = function* (s3HelperInstance, localHashesMap) {
  logger.info('▹ Uploading map of file hashes');
  const mapToStore = {
    hashes: localHashesMap.hashes,
    params: localHashesMap.params,
  };
  try {
    yield s3HelperInstance.storeRemoteHashesMap(mapToStore);
  } catch (e) {
    throw new CommonError('Files hash map uploading failed', e);
  }
  logger.info('✓ Complete\n');
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
  logger.info('▹ Creating CloudFront invalidation for', cfDistId);
  let invalidateResponse;
  try {
    invalidateResponse = yield invalidate(cfClient, cfDistId, cfInvPaths);
  } catch (e) {
    throw new CommonError('CloudFront invalidation creation failed', e);
  }
  const invalidationId = invalidateResponse.Invalidation.Id;
  logger.info('✓ Complete-> CloudFront invalidation created: %s\n', invalidationId);
  return invalidateResponse;
};

/**
 * Upload local file system objects to S3 using given map of hashes and S3 helper instance
 * @param s3HelperInstance
 * @param toUpload
 * @param basePath
 */
module.exports.uploadObjectsToS3 = function* (s3HelperInstance, toUpload, { basePath }) {
  const fileNames = Object.keys(toUpload.hashes);
  const filesAmount = fileNames.length;
  if (filesAmount) {
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾');
    logger.info('▹ %s file(s) to be uploaded', filesAmount);
    fileNames.forEach(n => logger.verbose(n));
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    logger.info('▹ Uploading');
    try {
      yield s3HelperInstance.uploadObjects(toUpload, basePath);
    } catch (e) {
      throw new CommonError('Files uploading failed', e);
    }
    logger.info('✓ Complete\n');
  } else {
    logger.info('▹ No files to be uploaded\n');
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
  const changed = {
    hashes: {},
    gzip: {},
  };
  for (const key of Object.keys(localHashes.hashes)) {
    const remoteFileHash = remoteMapCopy.hashes[key];
    if (remoteFileHash) {
      delete remoteMapCopy.hashes[key];
      if (remoteFileHash !== localHashes.hashes[key]) {
        changed.hashes[key] = localHashes.hashes[key];
        if (localHashes.gzip[key]) {
          changed.gzip[key] = localHashes.gzip[key];
        }
      }
    } else {
      changed.hashes[key] = localHashes.hashes[key];
      if (localHashes.gzip[key]) {
        changed.gzip[key] = localHashes.gzip[key];
      }
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
  logger.info('▹ Configuring AWS SDK');
  const awsOptions = {
    sslEnabled: true,
    region: params.region,
  };
  aws.config.update(awsOptions);
  aws.config.s3 = { params: { Bucket: params.bucket , Prefix: params.prefix } };
  if (params.profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: params.profile });
  }
  logger.info('✓ Complete\n');
  return aws;
};

/**
 * Compute map of file hashes for locally stored files
 * @param fileNames
 * @param params
 * @returns {Object}
 */
module.exports.computeLocalHashesMap = function* (fileNames, params) {
  logger.info('▹ Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, params);
  } catch (e) {
    throw new CommonError('Local files hash map computation failed', e);
  }
  const localFilesAmount = Object.keys(localHashesMap.hashes).length;
  logger.info('✓ Complete-> Found', localFilesAmount, 'files locally\n');
  return Object.assign({ params }, localHashesMap);
};

/**
 * Compute map of file hashes for S3-stored files
 * @param s3HelperInstance
 * @param params
 * @returns {*}
 */
module.exports.computeRemoteHashesMap = function* (s3HelperInstance, params) {
  logger.info('▹ Gathering map of hashes for S3-stored files');
  let remoteHashesMap;
  try {
    const useNoMap = params.ignoreMap || params.noMap;
    if (!useNoMap) {
      logger.info('  ▫ Retrieving map of hashes');
      remoteHashesMap = yield s3HelperInstance.getRemoteHashesMap();
      if (!remoteHashesMap) {
        logger.info('  × No map found');
      } else {
        logger.info('  ✓ Map found');
      }
    }
    if (!remoteHashesMap) {
      logger.info('  ▫ Computing map of hashes');
      remoteHashesMap = {
        hashes: (yield s3HelperInstance.computeRemoteFilesStats()),
      };
      logger.info('  ✓ Complete');
    }
  } catch (e) {
    throw new CommonError('Remote files hash map retrieval / computation failed', e);
  }
  const remoteFilesAmount = Object.keys(remoteHashesMap.hashes).length;
  logger.info('✓ Complete-> Found', remoteFilesAmount, 'files in S3\n');
  return remoteHashesMap;
};
