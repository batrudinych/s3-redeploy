'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { parallel, fsStatAsync } = require('./utils');

/**
 * Calculate file hash using stream API
 * @param path - Path to the file
 * @param alg - Algorithm to be used
 * @returns {Promise<Array>} - Promise, which resolves with a Uint array, containing file hash
 */
const computeFileHash = module.exports._computeFileHash = path => new Promise((resolve, reject) => {
  const hash = crypto.createHash('md5');
  const fileStream = fs.createReadStream(path);
  fileStream
    .on('error', e => {
      fileStream.close();
      reject(e);
    })
    .pipe(hash)
    .on('error', e => {
      fileStream.close();
      reject(e);
    })
    .on('finish', () => {
      hash.end();
      resolve(hash.read());
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
  yield parallel(
    fileNames,
    fileName => {
      const filePath = path.join(basePath, fileName);
      return fsStatAsync(filePath)
        .then(fstats => fstats.isFile() ? computeFileHash(filePath) : null)
        .then(hash => {
          if (hash) {
            localFilesStats[fileName] = {
              eTag: `"${hash.toString('hex')}"`,
              contentMD5: hash.toString('base64'),
            };
          }
        });
    },
    concurrency
  );
  return localFilesStats;
};
