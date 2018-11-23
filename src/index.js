const aws = require('aws-sdk');
const co = require('co');

const path = require('path');
const {
  globAsync,
  computeLocalFilesStats,
  getRemoteFilesStats,
  deleteObjects,
  uploadObjects,
  detectFileChanges,
  storeHashMap,
} = require('./lib');

// In order to run this:
// #1 run install --no-save mock-aws-s3
// #2 correct the following line in mock-aws-s3/lib/mock: line 210 "if (truncated && search.Delimiter) {" -> "if (truncated) {"
// #3 comment lines 229 -> 231 deleteObjects of function:
// else {
// errors.push(file);
// }

// TODO:
// #1 implement a command line args parser (list tbc)
// #2 store map of hashes onto s3 and use it upon processing (+ check { ACL: private } works as needed)
// #3 introduce high-level comparison of hash maps
// #4 refactor: replace s3 mock with a real handler, introduce parallel processing, spread onto modules, etc.
// #5 add Cloudfront distribution invalidate option
// #6 fill additional AWS parameters
// #5 implement tests using Jest
// #6 add redirect objects support
// #7 make a library out of this, that is possible to use as both script and an imported codebase

// TODO: think about work with versions and prefixes

module.exports = co.wrap(function* (params) {
  // TODO: sanitize / validate params
  const basePath = path.resolve(process.cwd(), params.cwd || '');
  const s3Params = { Bucket: params.bucket };
  const fileNames = (yield globAsync(params.pattern || './**', { cwd: basePath }))
    .map(p => path.relative(basePath, path.resolve(basePath, p)))
    .filter(p => !!p);

  // TODO: add profile usage possibility. Default is used for now
  const awsOptions = {
    sslEnabled: true,
    // region: params.region,
  };
  aws.config.update(awsOptions);
  const s3Client = new aws.S3();
  // const s3Client = require('../s3-mock').getS3Mock(params.bucket);

  const localHashesMap = yield computeLocalFilesStats(fileNames, basePath);
  const remoteHashesMap = yield getRemoteFilesStats(s3Client, s3Params);

  // TODO: if local map is empty => clear the bucket?
  const { toUpload, toDelete } = detectFileChanges(localHashesMap, remoteHashesMap);

  const uploadNeeded = Object.keys(toUpload).length;
  const removalNeeded = Object.keys(toDelete).length;

  if (uploadNeeded) {
    console.log('Uploading', uploadNeeded, 'files');
    yield uploadObjects(s3Client, { toUpload, basePath, s3Params });
  }

  if (removalNeeded) {
    console.log('Removing', removalNeeded, 'files');
    yield deleteObjects(s3Client, { toDelete, s3Params });
  }

  yield storeHashMap(s3Client, JSON.stringify(localHashesMap), s3Params);
});
