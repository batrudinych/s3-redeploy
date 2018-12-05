'use strict';

const co = require('co');
const path = require('path');

const s3Helper = require('./lib/s3-helper');
const { processParams } = require('./lib/args-processor');
const steps = require('./steps');

module.exports = co.wrap(function* (params) {
  const paramsObj = processParams(params);
  console.log('Execution starts with the following params:');
  console.log(JSON.stringify(paramsObj, null, 2));

  paramsObj.basePath = path.resolve(process.cwd(), paramsObj.cwd);

  const fileNames = yield steps.applyGlobPattern(paramsObj);

  if (!fileNames.length) {
    console.log('Found no files to process. Exit');
    return null;
  }

  const aws = steps.configureAwsSdk(paramsObj);
  const s3HelperInstance = s3Helper.getInstance(new aws.S3(), paramsObj);

  const localHashesMap = yield steps.computeLocalHashesMap(fileNames, paramsObj);

  const remoteHashesMap = yield steps.computeRemoteHashesMap(s3HelperInstance);

  console.log('Computing difference');
  const { toUpload, toDelete } = steps.detectFileChanges(localHashesMap, remoteHashesMap);

  yield steps.uploadObjectsToS3(s3HelperInstance, toUpload, paramsObj);

  if (!paramsObj.noRm) {
    yield steps.removeExcessFiles(s3HelperInstance, toDelete);
  } else {
    console.log('Skipping removal as correspondent flag is set');
    if (!paramsObj.noMap) {
      Object.assign(localHashesMap, toDelete);
    }
  }

  if (!paramsObj.noMap) {
    yield steps.storeHashesMapToS3(s3HelperInstance, localHashesMap);
  }

  if (paramsObj.cfDistId) {
    yield steps.invalidateCFDistribution(new aws.CloudFront(), paramsObj);
  }
});
