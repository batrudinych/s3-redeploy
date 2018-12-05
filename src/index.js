'use strict';

const aws = require('aws-sdk');
const co = require('co');
const path = require('path');

const { processParams } = require('./lib/args-processing');
const { invalidate } = require('./lib/cf-helper');
const s3Helper = require('./lib/s3-helper');
const { globAsync, configureAwsSdk } = require('./lib/utils');
const { computeLocalFilesStats, detectFileChanges } = require('./lib/hash-helper');
const { CommonError } = require('./lib/errors');

module.exports = co.wrap(function* (params) {
  const paramsObj = processParams(params);
  console.log('Execution starts with the following params:');
  console.log(JSON.stringify(paramsObj, null, 2));

  const basePath = path.resolve(process.cwd(), paramsObj.cwd);
  console.log('Applying glob pattern, base path is:', basePath);
  let globResult;
  try {
    globResult = yield globAsync(paramsObj.pattern, { cwd: basePath });
  } catch (e) {
    throw new CommonError('Search files by glob operation failed', { cause: e });
  }

  const fileNames = globResult
    .map(p => path.relative(basePath, path.resolve(basePath, p)))
    .filter(Boolean);

  if (!fileNames.length) {
    console.log('Complete. Found no files to process. Exit');
    return null;
  }
  console.log('Complete');

  const s3Client = new aws.S3();
  configureAwsSdk(aws, paramsObj);
  const s3HelperInstance = s3Helper.getInstance(s3Client, paramsObj);

  console.log('Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, basePath, paramsObj.concurrency);
  } catch (e) {
    throw new CommonError('Local files hash map computation failed', { cause: e });
  }

  const localFilesAmount = Object.keys(localHashesMap).length;
  console.log('Complete. Found', localFilesAmount, 'files locally');

  console.log('Computing map of hashes for S3-stored files');
  let remoteHashesMap;
  try {
    remoteHashesMap = yield s3HelperInstance.getRemoteFilesStats();
  } catch (e) {
    throw new CommonError('Remote files hash map retrieval / computation failed', { cause: e });
  }

  const remoteFilesAmount = Object.keys(remoteHashesMap).length;
  console.log('Complete. Found', remoteFilesAmount, 'files in S3');

  console.log('Computing difference');
  const { toUpload, toDelete } = detectFileChanges(localHashesMap, remoteHashesMap);

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

  if (!paramsObj.noRm) {
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
  } else {
    console.log('Skipping removal as correspondent flag is set');
    if (!paramsObj.noMap) {
      Object.assign(localHashesMap, toDelete);
    }
  }

  if (!paramsObj.noMap) {
    console.log('Saving map of file hashes');
    try {
      yield s3HelperInstance.storeRemoteHashesMap(localHashesMap);
    } catch (e) {
      throw new CommonError('Files hash map uploading failed', { cause: e });
    }
    console.log('Complete');
  }

  if (paramsObj.cfDistId) {
    console.log('Creating CloudFront invalidation for', paramsObj.cfDistId);
    let invalidateResponse;
    try {
      invalidateResponse = yield invalidate(new aws.CloudFront(), paramsObj.cfDistId, paramsObj.cdInvPaths);
    } catch (e) {
      throw new CommonError('CloudFront invalidation creation failed', { cause: e });
    }
    const invalidationId = invalidateResponse.Invalidation.Id;
    console.log('Complete. CloudFront invalidation created:', invalidationId);
  }
});
