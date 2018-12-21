'use strict';

const { dashToCamel, isPositiveInteger } = require('./utils');
const { CommonError } = require('./errors');
const supportedParameters = [
  'bucket',
  'cwd',
  'pattern',
  'gzip',
  'profile',
  'region',
  'cfDistId',
  'cfInvPaths',
  'ignoreMap',
  'noMap',
  'noRm',
  'concurrency',
  'fileName',
  'cache',
  'immutable',
  'verbose',
];

/**
 * Transform array with arguments into a map of values
 * @returns {Object}
 */
module.exports.parse = args => {
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const cmdValue = args[i];
    const isIdent = cmdValue.startsWith('--');
    if (isIdent) {
      const key = dashToCamel(cmdValue.slice(2));
      const nextCmdValue = args[i + 1];
      const isCurBool = !nextCmdValue || nextCmdValue.startsWith('--');
      params[key] = isCurBool ? true : nextCmdValue;
      if (!isCurBool) i++;
    }
  }
  return params;
};

/**
 * Sanitize and validate parameters
 * @param params
 * @returns {Object}
 */
module.exports.processParams = params => {
  const keys = Object.keys(params);
  for (const key of keys) {
    if (!supportedParameters.includes(key)) {
      throw new CommonError('Unknown parameter: ' + key);
    }
  }

  if (!params.bucket) {
    throw new CommonError('Bucket name should be set');
  }
  if (params.bucket.includes('\\') || params.bucket.includes('/')) {
    throw new CommonError('Bucket name should contain no slashes');
  }

  const result = Object.assign({}, params);

  result.pattern = params.pattern || './**';
  result.cwd = params.cwd || '';

  if (result.concurrency) {
    if (!isPositiveInteger(result.concurrency)) {
      throw new CommonError('Concurrency value should be a positive integer');
    }
    result.concurrency = parseInt(params.concurrency, 10);
  } else {
    result.concurrency = 5;
  }

  result.fileName = params.fileName || `_s3-rd.${params.bucket}.json`;
  if (result.fileName.startsWith('/')) {
    result.fileName = result.fileName.slice(1);
  }

  if (result.cfInvPaths) {
    result.cfInvPaths = result.cfInvPaths.split(';').filter(Boolean).map(v => v[0] === '/' ? v : '/' + v);
  }

  if (result.gzip && typeof result.gzip === 'string') {
    result.gzip = result.gzip
      .replace(/ /g, '')
      .split(';')
      .filter(Boolean)
      .map(s => s.toLowerCase())
      .sort();
  }

  return result;
};
