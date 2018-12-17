'use strict';

const co = require('co');
const path = require('path');

const s3Helper = require('./lib/s3-helper');
const { processParams } = require('./lib/args-processor');
const { isMetaChanged } = require('./lib/utils');
const steps = require('./steps');

module.exports = co.wrap(function* (params, logger) {
  const paramsObj = processParams(params);
  logger = logger || require('./lib/logger').init({ level: paramsObj.verbose ? 'verbose' : 'info' });
  logger.verbose('∾∾∾∾∾∾∾∾∾∾ s3-redeploy ∾∾∾∾∾∾∾∾∾∾');
  logger.verbose('Execution starts with the following params:');
  logger.verbose(JSON.stringify(paramsObj, null, 2));
  logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');

  paramsObj.basePath = path.resolve(process.cwd(), paramsObj.cwd);

  const fileNames = yield steps.applyGlobPattern(paramsObj);

  if (!fileNames.length) {
    logger.info('Found no files to process. Exit\n');
    return null;
  } else {
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾');
    logger.info('▹ %s items found in file system', fileNames.length);
    fileNames.forEach(n => logger.verbose(n));
    logger.verbose('∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾∾\n');
  }

  const aws = steps.configureAwsSdk(paramsObj);
  const s3HelperInstance = s3Helper.getInstance(new aws.S3(), paramsObj);

  const localHashesMap = yield steps.computeLocalHashesMap(fileNames, paramsObj);

  const shouldUpdateOnly = paramsObj.noRm && paramsObj.noMap;

  if (shouldUpdateOnly) {
    yield steps.uploadObjectsToS3(s3HelperInstance, localHashesMap.hashes, paramsObj);
  } else {
    const remoteHashesMap = yield steps.computeRemoteHashesMap(s3HelperInstance, paramsObj);

    logger.info('▹ Computing difference\n');
    const { changed, removed } = steps.detectFileChanges(localHashesMap.hashes, remoteHashesMap.hashes);

    const toUpload = isMetaChanged(paramsObj, remoteHashesMap.params) ? localHashesMap.hashes : changed;

    yield steps.uploadObjectsToS3(s3HelperInstance, toUpload, paramsObj);

    if (!paramsObj.noRm) {
      yield steps.removeExcessFiles(s3HelperInstance, removed);
    } else {
      logger.info('▹ Skip removal as correspondent flag is set\n');
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
