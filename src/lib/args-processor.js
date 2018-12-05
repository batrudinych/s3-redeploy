'use strict';

/**
 * Transform array with arguments into a map of values
 * @returns {Object}
 */
module.exports.parseCmdArgs = args => {
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const cmdValue = args[i];
    const isIdent = cmdValue.startsWith('--');
    if (isIdent) {
      const key = module.exports.dashToCamel(cmdValue.slice(2));
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
  if (!params.bucket) {
    throw new Error('Bucket name should be set');
  }
  if (params.bucket.includes('\\') || params.bucket.includes('/')) {
    throw new Error('Bucket name should contain no slashes');
  }

  const result = Object.assign({}, params);

  result.pattern = params.pattern || './**';
  result.cwd = params.cwd || '';

  if (result.concurrency) {
    if (!module.exports.isPositiveInteger(result.concurrency)) {
      throw new Error('Concurrency value should be a positive integer');
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
    result.gzip = result.gzip.replace(/ /g, '').split(';').filter(Boolean).map(s => s.toLowerCase());
  }

  return result;
};

/**
 * Transform string in dash case to camel case
 * @param str
 * @returns {String}
 */
module.exports.dashToCamel = str => {
  if (!str) return '';

  const parts = str.split('-');
  let result = parts.splice(0, 1)[0].toLowerCase();
  for (const part of parts) {
    result += part[0].toUpperCase() + part.substring(1).toLowerCase();
  }
  return result;
};

/**
 * Checks whether value represents a positive integer or not
 * @param val
 * @returns {boolean}
 */
module.exports.isPositiveInteger =
  val => !isNaN(val) && String(parseInt(val, 10)) === String(val) && parseInt(val, 10) > 0;
