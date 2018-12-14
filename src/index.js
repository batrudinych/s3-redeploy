'use strict';

const co = require('co');
const path = require('path');

const s3Helper = require('./lib/s3-helper');
const { processParams } = require('./lib/args-processor');
const steps = require('./steps');

module.exports = co.wrap(function* (params) {
  const paramsObj = processParams(params);
  console.log('∾∾∾∾∾∾∾∾∾∾ s3-redeploy ∾∾∾∾∾∾∾∾∾∾');
  console.log('Execution starts with the following params:');
  console.log(JSON.stringify(paramsObj, null, 2));
  console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');

  paramsObj.basePath = path.resolve(process.cwd(), paramsObj.cwd);

  const fileNames = yield steps.applyGlobPattern(paramsObj);

  if (!fileNames.length) {
    console.log('Found no files to process. Exit\n');
    return null;
  } else {
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
    console.log('▹ %s items found in file system:', fileNames.length);
    fileNames.forEach(n => console.log(n));
    console.log('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
  }

  const aws = steps.configureAwsSdk(paramsObj);
  const s3HelperInstance = s3Helper.getInstance(new aws.S3(), paramsObj);

  const localHashesMap = yield steps.computeLocalHashesMap(fileNames, paramsObj);

  const shouldUpdateOnly = paramsObj.noRm && paramsObj.noMap;

  if (shouldUpdateOnly) {
    yield steps.uploadObjectsToS3(s3HelperInstance, localHashesMap.hashes, paramsObj);
  } else {
    const remoteHashesMap = yield steps.computeRemoteHashesMap(s3HelperInstance, paramsObj);

    const prevParams = remoteHashesMap.params;
    const metadataChanged = !prevParams || prevParams.cache !== paramsObj.cache || prevParams.gzip !== paramsObj.gzip;

    console.log('▹ Computing difference\n');
    const { changed, removed } = steps.detectFileChanges(localHashesMap.hashes, remoteHashesMap.hashes);

    const toUpload = metadataChanged ? localHashesMap.hashes : changed;

    yield steps.uploadObjectsToS3(s3HelperInstance, toUpload, paramsObj);

    if (!paramsObj.noRm) {
      yield steps.removeExcessFiles(s3HelperInstance, removed);
    } else {
      console.log('▹ Skipping removal as correspondent flag is set');
      Object.assign(localHashesMap.hashes, removed);
    }

    if (!paramsObj.noMap) {
      yield steps.storeHashesMapToS3(s3HelperInstance, localHashesMap);
    }
  }

  if (paramsObj.cfDistId) {
    yield steps.invalidateCFDistribution(new aws.CloudFront(), paramsObj);
  }
});
