/**
 * Transform process.argv into a map of values
 * @returns {Object}
 */
module.exports.parseCmdArgs = () => {
  const params = {};
  for (let i = 2; i < process.argv.length; i++) {
    const cmdValue = process.argv[i];
    const isIdent = cmdValue.startsWith('--');
    if (isIdent) {
      const key = module.exports.dashToCamel(cmdValue.slice(2));
      const nextCmdValue = process.argv[i + 1];
      const isNextIdent = nextCmdValue && nextCmdValue.startsWith('--');
      params[key] = isNextIdent ? true : nextCmdValue;
      if (!isNextIdent) i++;
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
  const result = {};

  for (const key of Object.keys(params)) {
    result[module.exports.dashToCamel(key)] = params[key];
  }

  result.pattern = params.pattern || './**';
  result.cwd = params.cwd || '';
  result.concurrency = parseInt(params.concurrency || 5, 10);
  result.fileName = params.fileName || `_s3-rd.${params.bucket}.json`;

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
 * @param string
 * @returns {string}
 */
module.exports.dashToCamel = string => {
  if (!string) return '';

  const parts = string.split('-');
  let result = parts.splice(0, 1)[0].toLowerCase();
  for (const part of parts) {
    result += part[0].toUpperCase() + part.substring(1).toLowerCase();
  }
  return result;
};

module.exports.isPositiveInteger = val => !isNaN(val) && String(parseInt(val, 10)) === String(val) && parseInt(val, 10) > 0;
