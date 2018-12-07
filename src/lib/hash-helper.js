'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { parallel, fsStatAsync } = require('./utils');

/**
 * Calculate file hash using stream API
 * @param path - Path to the file
 * @returns {Promise<Array>} - Promise, which resolves with a Uint array, containing file hash
 */
module.exports._computeFileHash = path => new Promise((resolve, reject) => {
  const hash = crypto.createHash('md5');
  const fileStream = fs.createReadStream(path);
  let errorHappened = false;
  fileStream
    .on('error', reject)
    .pipe(hash)
    .on('error', e => {
      errorHappened = true;
      fileStream.close();
      hash.end();
      reject(e);
    })
    .on('finish', () => {
      if (!errorHappened) {
        hash.end();
        resolve(hash.read());
      }
    });
});

/**
 * Compute a map of file hashes for given files list. A generator-function.
 * @param fileNames - File names array, relative to cwd
 * @param basePath - Absolute path to the folder, containing files to be processed
 * @param concurrency - Parallel execution limit
 * @returns {Object} - Map of file hashes in form of: relative [file name]: {hash data}
 */
module.exports.computeLocalFilesStats = function* (fileNames, basePath, concurrency) {
  const localFilesStats = {};
  const fileNameProcessor = module.exports._getFileNameProcessor(basePath, localFilesStats);
  yield parallel(
    fileNames,
    fileNameProcessor,
    concurrency
  );
  return localFilesStats;
};

module.exports._getFileNameProcessor = (basePath, localFilesStats) => fileName => {
  const filePath = path.join(basePath, fileName);
  return fsStatAsync(filePath)
    .then(fstats => fstats.isFile() ? module.exports._computeFileHash(filePath) : null)
    .then(hash => {
      if (hash) {
        localFilesStats[fileName] = {
          eTag: `"${hash.toString('hex')}"`,
          contentMD5: hash.toString('base64'),
        };
      }
    });
};
