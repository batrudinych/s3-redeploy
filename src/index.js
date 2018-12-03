const aws = require('aws-sdk');
const co = require('co');
const path = require('path');

const { processParams } = require('./lib/args-processor');
const { invalidate } = require('./lib/cf-helper');
const s3Helper = require('./lib/s3-helper');
const { globAsync, computeLocalFilesStats, detectFileChanges } = require('./lib/utils');
const CommonError = require('./lib/common-error');

module.exports = co.wrap(function* (params) {
  const opts = processParams(params);
  console.log('Execution starts with the following params:');
  console.log(JSON.stringify(opts, null, 2));

  const basePath = path.resolve(process.cwd(), opts.cwd);
  console.log('Applying glob pattern, base path is:', basePath);
  let globResult;
  try {
    globResult = yield globAsync(opts.pattern, { cwd: basePath });
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

  const awsOptions = {
    sslEnabled: true,
    region: opts.region,
  };
  aws.config.update(awsOptions);
  if (opts.profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: opts.profile });
  }
  const s3Client = new aws.S3();
  const s3HelperInstance = s3Helper.getInstance(s3Client, opts);

  console.log('Computing map of hashes for local files');
  let localHashesMap;
  try {
    localHashesMap = yield computeLocalFilesStats(fileNames, basePath, opts.concurrency);
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

  if (!opts.noRm) {
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
    Object.assign(localHashesMap, toDelete);
  }

  console.log('Saving map of file hashes');
  try {
    yield s3HelperInstance.storeRemoteHashesMap(localHashesMap);
  } catch (e) {
    throw new CommonError('Files hash map uploading failed', { cause: e });
  }
  console.log('Complete');

  if (opts.cfDistId) {
    console.log('Creating CloudFront invalidation for', opts.cfDistId);
    let invalidateResponse;
    try {
      invalidateResponse = yield invalidate(new aws.CloudFront(), opts.cfDistId, opts.cdInvPaths);
    } catch (e) {
      throw new CommonError('CloudFront invalidation creation failed', { cause: e });
    }
    const invalidationId = invalidateResponse.Invalidation.Id;
    console.log('Complete. CloudFront invalidation created:', invalidationId);
  }
});
