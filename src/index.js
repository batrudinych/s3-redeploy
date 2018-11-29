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

// Supported params: bucket, region, cwd, pattern, concurrency, file-name, gzip
module.exports = co.wrap(function* (params) {
  const opts = processParams(params);

  const basePath = path.resolve(process.cwd(), opts.cwd);
  const fileNames = (yield globAsync(opts.pattern, { cwd: basePath }))
    .map(p => path.relative(basePath, path.resolve(basePath, p)))
    .filter(p => !!p);

  // TODO: add profile usage possibility. Default is used for now
  const awsOptions = {
    sslEnabled: true,
    region: opts.region,
  };
  aws.config.update(awsOptions);
  const s3Client = new aws.S3();
  // const s3Client = require('../s3-mock/s3-mock').getS3Mock(opts.bucket);
  const s3HelperInstance = s3Helper.getInstance(s3Client, opts);

  const localHashesMap = yield computeLocalFilesStats(fileNames, basePath, opts.concurrency);
  const remoteHashesMap = yield s3HelperInstance.getRemoteFilesStats();

  const { toUpload, toDelete } = detectFileChanges(localHashesMap, remoteHashesMap);

  const uploadNeeded = Object.keys(toUpload).length;
  const removalNeeded = Object.keys(toDelete).length;

  if (uploadNeeded) {
    console.log('Uploading', uploadNeeded, 'files');
    yield s3HelperInstance.uploadObjects(toUpload, basePath);
  }

  if (removalNeeded) {
    console.log('Removing', removalNeeded, 'files');
    yield s3HelperInstance.deleteObjects(toDelete);
  }

  yield s3HelperInstance.storeRemoteHashMap(JSON.stringify(localHashesMap));
});
