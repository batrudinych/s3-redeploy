'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { parallel, fsStatAsync, gzipStream, shouldGzip } = require('./utils');

/**
 * Calculate file hash using stream API
 * @param path - Path to the file
 * @param gzip - Flag, indicating if file contents should be gzipped
 * @returns {Promise<Array>} - Promise, which resolves with a Uint array, containing file hash
 */
module.exports._computeFileHash = (path, gzip) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('md5');
  const fileStream = fs.createReadStream(path);
  let errorHappened = false;
  let streamsChain = fileStream.on('error', reject);
  if (gzip) {
    streamsChain = gzipStream(fileStream).on('error', errorHandler);
  }
  streamsChain
    .pipe(hash)
    .on('error', errorHandler)
    .on('finish', () => {
      if (!errorHappened) {
        hash.end();
        resolve(hash.read());
      }
    });

  function errorHandler(e) {
    errorHappened = true;
    fileStream.close();
    hash.end();
    reject(e);
  }
});

/**
 * Compute a map of file hashes for given files list. A generator-function.
 * @param fileNames - File names array, relative to cwd
 * @param basePath - Absolute path to the folder, containing files to be processed
 * @param concurrency - Parallel execution limit
 * @param gzip - Flag / list of extensions to gzip
 * @returns {Object} - Map of file hashes in form of: relative [file name]: {hash data}
 */
module.exports.computeLocalFilesStats = function* (fileNames, { basePath, concurrency, gzip }) {
  const localFilesStats = {
    hashes: {},
    gzip: {},
  };
  const fileNameProcessor = module.exports._getFileNameProcessor(basePath, localFilesStats, gzip);
  yield parallel(
    fileNames,
    fileNameProcessor,
    concurrency
  );
  return localFilesStats;
};

module.exports._getFileNameProcessor = (basePath, localFilesStats, gzip) => fileName => {
  const filePath = path.join(basePath, fileName);
  return fsStatAsync(filePath)
    .then(fstats => {
      if (fstats.isFile()) {
        const gzipFlag = shouldGzip(filePath, gzip);
        if (gzipFlag) {
          localFilesStats.gzip[fileName] = gzipFlag;
        }
        return module.exports._computeFileHash(filePath, gzipFlag);
      }

      return null;
    })
    .then(hash => {
      if (hash) {
        localFilesStats.hashes[fileName] = hash.toString('hex');
      }
    });
};
