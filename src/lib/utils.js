const glob = require('glob');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Pipe a gzip stream to the given stream
 * @param stream
 */
module.exports.gzipStream = stream => {
  const zip = zlib.createGzip();
  return stream.pipe(zip);
};
/**
 * Promisified version of zlib.gzip
 * @param data
 * @returns {Promise<Buffer>}
 */
module.exports.gzipAsync = data => new Promise((resolve, reject) => zlib.gzip(data, (err, result) => err ? reject(err) : resolve(result)));
/**
 * Promisified version of zlib.gunzip method
 * @param data
 * @returns {Promise<Buffer>}
 */
module.exports.gunzipAsync = data =>
  new Promise((resolve, reject) => zlib.gunzip(data, (err, result) => err ? reject(err) : resolve(result)));
/**
 * Promisified version of fs.stat method
 * @param path - Path to the file
 * @returns {Promise<Object>} - Promise, which resolves with file statistics
 */
module.exports.fsStatAsync = path => new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));
/**
 * Calculate file hash using stream API
 * @param path - Path to the file
 * @param alg - Algorithm to be used
 * @returns {Promise<Array>} - Promise, which resolves with a Uint array, containing file hash
 */
module.exports.computeFileHash = (path, alg) => new Promise((resolve, reject) => {
  const hash = crypto.createHash(alg);
  fs.createReadStream(path).pipe(hash) // TODO close file on error
    .on('error', reject)
    .on('finish', () => {
      hash.end();
      resolve(hash.read());
    });
});
/**
 * Calculate list of files, matching supplied glob pattern. Promisified version of 'glob' method
 * See https://www.npmjs.com/package/glob
 * @param pattern - Glob pattern
 * @param options - Options according to glob package documentation
 * @returns {Promise<Array>} - Promise, which resolves with an array of matching file names
 */
module.exports.globAsync = (pattern, options) =>
  new Promise((resolve, reject) => glob(pattern, options, (err, matches) => err ? reject(err) : resolve(matches)));
/**
 * Calculate the difference between remote and local maps of file hashes
 * @param localHashesMap - A map of file hashes of locally stored files
 * @param remoteHashesMap - A map of file hashes of files stored in S3
 * @returns {{toUpload: {Object}, toDelete: {Object}}} - Object, containing maps of file hashes to be uploaded and deleted correspondingly
 */
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
/**
 * Compute a map of file hashes for given files list. A generator-function.
 * @param fileNames - File names array, relative to cwd
 * @param basePath - Absolute path to the folder, containing files to be processed
 * @param concurrency - Parallel execution limit
 * @returns {Object} - Map of file hashes in form of: relative [file name]: {hash data}
 */
module.exports.computeLocalFilesStats = function* (fileNames, basePath, concurrency) {
  const localFilesStats = {};
  yield module.exports.parallel(
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
 * Run promises in parallel, applying a concurrency limit
 * @param args - Array of arguments. fn to be invoked with each argument
 * @param fn - Function to be executed for each argument. Must return a promise
 * @param concurrency - Integer, which indicates limit of concurrently running promises allowed
 * @returns {Promise} - Promise, which resolves with an array, containing results of each invocation
 */
module.exports.parallel = (args, fn, concurrency = 1) => {
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

