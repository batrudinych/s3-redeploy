const glob = require('glob');
const co = require('co');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports.FS_CONCURRENCY = 3;

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
module.exports.computeLocalFilesStats = function* (fileNames, basePath) {
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
    module.exports.FS_CONCURRENCY
  );
  return localFilesStats;
};

module.exports.mapPromises = (args, fn, concurrency = 1) => {
  if (!args.length) return Promise.resolve([]);
  const promisesArray = new Array(concurrency).fill(Promise.resolve());
  const results = new Array(args.length);
  args.forEach((val, i) => {
    const index = i % concurrency;
    promisesArray[index] = promisesArray[index].then(() => fn(val).then(res => {
      results[i] = res;
    }));
  });
  return Promise.all(promisesArray).then(() => results);
};
