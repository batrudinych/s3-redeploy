const { mapPromises } = require('./utils');
const fs = require('fs');
const path = require('path');

class S3Helper {
  constructor(s3Client, s3Params) {
    this._S3_HASHES_FILE_NAME = '__hash_map__.json';
    this._S3_CONCURRENCY = 5;
    this._s3Client = s3Client;
    this._s3Params = s3Params;
  }

  getRemoteMap() {
    return this._s3Client.getObject(Object.assign({ Key: this._S3_HASHES_FILE_NAME }, this._s3Params))
      .promise()
      .then(data => data.Body)
      .catch(err => {
        if (err.statusCode === 404) return null;
        throw err;
      });
  }

  _uploadObject({ fileName, fileData, basePath }) {
    return this._s3Client.putObject(
      Object.assign({
        ACL: 'public-read',
        Key: fileName,
        Body: fs.createReadStream(path.join(basePath, fileName)),
        ContentMD5: fileData.contentMD5,
      }, this._s3Params)).promise();
  }

  deleteObjects({ toDelete }) {
    const allObjects = Object.keys(toDelete).map(Key => ({ Key }));
    const batchSize = 1000;
    const batchesCount = Math.ceil(allObjects.length / batchSize);
    const batches = [];
    for (let i = 0; i < batchesCount; i++) {
      const startIndex = i * batchSize;
      batches.push(allObjects.slice(startIndex, startIndex + batchSize));
    }
    return mapPromises(
      batches,
      batch => this._s3Client.deleteObjects(Object.assign({ Delete: { Objects: batch } }, this._s3Params)).promise(),
      this._S3_CONCURRENCY
    );
  }

  uploadObjects({ toUpload, basePath }) {
    return mapPromises(
      Object.keys(toUpload),
      fileName => this._uploadObject({ fileName, fileData: toUpload[fileName], basePath }),
      this._S3_CONCURRENCY
    );
  }

  storeHashMap(body) {
    return this._s3Client.putObject(Object.assign({ Key: this._S3_HASHES_FILE_NAME, Body: body }, this._s3Params)).promise();
  }

  * computeRemoteFilesStats() {
    const params = Object.assign({}, this._s3Params);
    let hasNext = true;
    const remoteFilesStats = {};
    while (hasNext) {
      const { Contents, IsTruncated, NextContinuationToken } = yield this._s3Client.listObjectsV2(params).promise();
      for (const item of Contents) {
        // TODO: in case of user input, may be nested
        if (item.Key === this._S3_HASHES_FILE_NAME) continue;
        remoteFilesStats[item.Key] = item;
      }
      hasNext = IsTruncated;
      params.ContinuationToken = NextContinuationToken;
    }
    return remoteFilesStats;
  }

  * getRemoteFilesStats() {
    const remoteStoredMap = yield this.getRemoteMap(this._s3Params);
    return remoteStoredMap ? JSON.parse(remoteStoredMap) : (yield this.computeRemoteFilesStats());
  }
}

module.exports.getInstance = (s3Client, s3Params) => new S3Helper(s3Client, s3Params);
