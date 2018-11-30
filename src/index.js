const aws = require('aws-sdk');
const co = require('co');
const path = require('path');
const {
  globAsync,
  computeLocalFilesStats,
  detectFileChanges,
  processParams,
} = require('./lib/utils');

const s3Helper = require('./lib/s3-helper');

module.exports = co.wrap(function* (params) {
  const opts = processParams(params);
  console.log('Executing with the following params:');
  console.log(JSON.stringify(opts, null, 2));

  const basePath = path.resolve(process.cwd(), opts.cwd);
  const fileNames = (yield globAsync(opts.pattern, { cwd: basePath }))
    .map(p => path.relative(basePath, path.resolve(basePath, p)))
    .filter(Boolean);

  if (!fileNames.length) {
    console.log('Found no files to process. Exit');
    return null;
  }

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

  const localHashesMap = yield computeLocalFilesStats(fileNames, basePath, opts.concurrency);
  const localFilesAmount = Object.keys(localHashesMap).length;
  console.log('Found', localFilesAmount, 'files locally');

  const remoteHashesMap = yield s3HelperInstance.getRemoteFilesStats();
  const remoteFilesAmount = Object.keys(localHashesMap).length;
  console.log('Found', remoteFilesAmount, 'files in S3');

  const { toUpload, toDelete } = detectFileChanges(localHashesMap, remoteHashesMap);

  const uploadNeeded = Object.keys(toUpload).length;
  console.log('%s files to be uploaded', uploadNeeded);

  if (uploadNeeded) {
    yield s3HelperInstance.uploadObjects(toUpload, basePath);
    console.log('Uploading complete');
  }

  const removalNeeded = Object.keys(toDelete).length;
  console.log('%s files to be removed', removalNeeded);

  if (removalNeeded) {
    yield s3HelperInstance.deleteObjects(toDelete);
    console.log('Removal complete');
  }

  yield s3HelperInstance.storeRemoteHashMap(localHashesMap);
  console.log('Map of file hashes successfully uploaded');
});
