const glob = require('glob');
const co = require('co');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const S3_HASHES_FILE_NAME = '__hash_map__.json';

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

module.exports.getRemoteMap = (s3Client, s3Params) => s3Client.getObject(Object.assign({ Key: S3_HASHES_FILE_NAME }, s3Params))
  .promise()
  .then(data => data.Body)
  .catch(err => {
    if (err.statusCode === 404) return null;
    throw err;
  });

module.exports.storeHashMap = (s3Client, body, s3Params) =>
  s3Client.putObject(Object.assign({ Key: S3_HASHES_FILE_NAME, Body: body }, s3Params)).promise();

module.exports.uploadObject = (s3Client, { fileName, fileData, basePath, s3Params }) =>
  s3Client.putObject(
    Object.assign({
      ACL: 'public-read',
      Key: fileName,
      Body: fs.createReadStream(path.join(basePath, fileName)),
      ContentMD5: fileData.contentMD5,
    }, s3Params)).promise();

module.exports.deleteObjects = (s3Client, { toDelete, s3Params }) => {
  const allObjects = Object.keys(toDelete).map(Key => ({ Key }));
  const promises = [];
  while (allObjects.length) {
    const objectsToDelete = allObjects.splice(0, 1000);
    if (objectsToDelete.length) {
      promises.push(s3Client.deleteObjects(Object.assign({ Delete: { Objects: objectsToDelete } }, s3Params)).promise());
    }
  }
  return promises;
};

module.exports.uploadObjects = function* (s3Client, { toUpload, basePath, s3Params }) {
  for (const fileName of Object.keys(toUpload)) {
    yield module.exports.uploadObject(s3Client, { fileName, fileData: toUpload[fileName], basePath, s3Params });
  }
};

// Compute a map of local files stats
module.exports.computeLocalFilesStats = function* (fileNames, basePath) {
  const localFilesStats = {};
  for (const fileName of fileNames) {
    const filePath = path.join(basePath, fileName);
    const fstats = yield module.exports.fsStatAsync(filePath);
    if (fstats.isFile()) {
      const hash = yield module.exports.computeFileHash(filePath, 'md5');
      localFilesStats[fileName] = {
        ETag: `"${hash.toString('hex')}"`,
        contentMD5: hash.toString('base64'),
      };
    }
  }
  return localFilesStats;
};

// Retrieve files stats from s3
module.exports.computeRemoteFilesStats = function* (s3Client, s3Params) {
  const params = Object.assign({}, s3Params);
  let hasNext = true;
  const remoteFilesStats = {};
  while (hasNext) {
    const { Contents, IsTruncated, NextContinuationToken } = yield s3Client.listObjectsV2(params).promise();
    for (const item of Contents) {
      // TODO: in case of user input, may be nested
      if (item.Key === S3_HASHES_FILE_NAME) continue;
      remoteFilesStats[item.Key] = item;
    }
    hasNext = IsTruncated;
    params.ContinuationToken = NextContinuationToken;
  }
  return remoteFilesStats;
};

module.exports.getRemoteFilesStats = function* (s3Client, s3Params) {
  const remoteStoredMap = yield module.exports.getRemoteMap(s3Client, s3Params);
  return remoteStoredMap ? JSON.parse(remoteStoredMap) : (yield module.exports.computeRemoteFilesStats(s3Client, s3Params));
};

const S3_STRUCTURE = [
  { Key: 'test-file-2.txt' },
  { Key: 'test-file-3.txt' },
  { Key: 'test_folder2/test-file-1.txt' },
  { Key: 'test_folder2/test-file-11.txt' },
];

// TODO: remove this once tests are implemented
module.exports.setupMock = (s3Client, bucket) =>
  Promise.all(S3_STRUCTURE.map(k => s3Client.putObject(Object.assign({ Bucket: bucket, Body: 'tmp body' }, k)).promise()))
    .then(() => co(
      module.exports.computeLocalFilesStats(S3_STRUCTURE.map(val => val.Key), path.resolve(process.cwd(), 's3-mock/buckets', bucket))))
    .then(stats => s3Client.putObject({ Key: S3_HASHES_FILE_NAME, Bucket: bucket, Body: JSON.stringify(stats) }).promise());
