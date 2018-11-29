const glob = require('glob');

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports.gzipStream = stream => {
  const zip = zlib.createGzip();
  return stream.pipe(zip);
};

module.exports.gzipAsync = data => new Promise((resolve, reject) => zlib.gzip(data, (err, result) => err ? reject(err) : resolve(result)));

module.exports.gunzipAsync = data =>
  new Promise((resolve, reject) => zlib.gunzip(data, (err, result) => err ? reject(err) : resolve(result)));

module.exports.fsStatAsync = path => new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));

// Get Uint array with hash using streams
module.exports.computeFileHash = (path, alg) => new Promise((resolve, reject) => {
  const hash = crypto.createHash(alg);
  fs.createReadStream(path).pipe(hash) // TODO close file on error
    .on('error', reject)
    .on('finish', () => {
      hash.end();
      resolve(hash.read());
    });
});

// Get list of file names, matching the pattern. Can be both absolute / relative
module.exports.globAsync = (pattern, options) =>
  new Promise((resolve, reject) => glob(pattern, options, (err, matches) => err ? reject(err) : resolve(matches)));

// Compute local and remote states diff
module.exports.detectFileChanges = (localHashesMap, remoteHashesMap) => {
  const remoteMapCopy = Object.assign({}, remoteHashesMap);
  const toUpload = {};
  for (const key of Object.keys(localHashesMap)) {
    const remoteFileData = remoteMapCopy[key];
    if (remoteFileData) {
      delete remoteMapCopy[key];
      if (remoteFileData.ETag !== localHashesMap[key].ETag) {
        toUpload[key] = localHashesMap[key];
      }
    } else {
      toUpload[key] = localHashesMap[key];
    }
  }
  return { toUpload, toDelete: remoteMapCopy };
};

// Compute a map of local files stats
module.exports.computeLocalFilesStats = function* (fileNames, basePath, concurrency = 5) {
  const localFilesStats = {};
  yield module.exports.mapPromises(
    fileNames,
    fileName => {
      const filePath = path.join(basePath, fileName);
      return module.exports.fsStatAsync(filePath)
        .then(fstats => fstats.isFile() ? module.exports.computeFileHash(filePath, 'md5') : null)
        .then(hash => {
          if (hash) {
            localFilesStats[fileName] = {
              ETag: `"${hash.toString('hex')}"`,
              contentMD5: hash.toString('base64'),
            };
          }
        });
    },
    concurrency
  );
  return localFilesStats;
};

/**
 * Run promises in parallel, applying concurrency limit
 * @param args - Array of arguments. fn to be invoked with each argument
 * @param fn - Function to be executed for each argument. Must return a promise
 * @param concurrency - Integer, which indicates limit of concurrently running promises allowed
 * @returns {Promise} - Promise, which resolves with an array, containing results of each invocation
 */
module.exports.mapPromises = (args, fn, concurrency = 1) => {
  if (!args.length) return Promise.resolve([]);
  const argsCopy = [].concat(args.map((val, ind) => ({ val, ind })));
  const result = new Array(args.length);
  const promises = new Array(concurrency).fill(Promise.resolve());

  function chainNext(p) {
    const arg = argsCopy.shift();
    return arg ? p.then(() => chainNext(fn(arg.val).then(r => {
      result[arg.ind] = r;
    }))) : p;
  }

  return Promise.all(promises.map(chainNext)).then(() => result);
};

module.exports.parseCmdArgs = () => {
  const params = {};
  for (let i = 2; i < process.argv.length;) {
    if (!process.argv[i + 1]) {
      params[process.argv[i].slice(2)] = true;
      i++;
    } else {
      const isNextIdent = process.argv[i + 1].startsWith('--');
      params[process.argv[i].slice(2)] = isNextIdent ? true : process.argv[i + 1];
      i += isNextIdent ? 1 : 2;
    }
  }
  return params;
};

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
  result.concurrency = parseInt(params.concurrency || 5);
  result.fileName = params.fileName || `_s3-rd.${params.bucket}.json`;

  if (result.gzip && typeof result.gzip === 'string') {
    result.gzip = result.gzip.replace(/ /g, '').split(',').filter(Boolean).map(s => s.toLowerCase());
  }

  return result;
};

module.exports.dashToCamel = string => {
  if (!string) return '';

  const parts = string.split('-');
  let result = parts.splice(0, 1)[0].toLowerCase();
  for (const part of parts) {
    result += part[0].toUpperCase() + part.substring(1).toLowerCase();
  }
  return result;
};
