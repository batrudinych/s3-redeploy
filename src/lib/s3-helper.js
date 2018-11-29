const { mapPromises, gzipStream, gzipAsync, gunzipAsync } = require('./utils');
const fs = require('fs');
const path = require('path');

class S3Helper {
  constructor(s3Client, params) {
    this._gzip = params.gzip;
    this._mapFileName = params.fileName;
    this._concurrency = params.concurrency;
    this._s3Client = s3Client;
    this._s3BaseParams = { Bucket: params.bucket };
  }

  deleteObjects(toDelete) {
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
      batch => this._s3Client.deleteObjects(Object.assign({ Delete: { Objects: batch } }, this._s3BaseParams)).promise(),
      this._concurrency
    );
  }

  uploadObjects(toUpload, basePath) {
    return mapPromises(
      Object.keys(toUpload),
      fileName => this._uploadObject(fileName, toUpload[fileName], basePath),
      this._concurrency
    );
  }

  getRemoteHashMap() {
    return this._s3Client.getObject(Object.assign({ Key: this._mapFileName }, this._s3BaseParams))
      .promise()
      .then(data => gunzipAsync(data.Body))
      .then(buff => buff.toString('utf8'))
      .catch(err => {
        if (err.statusCode === 404) return null;
        throw err;
      });
  }

  storeRemoteHashMap(map) {
    const mapUploadParams = Object.assign({ ContentEncoding: 'gzip' }, this._s3BaseParams);
    return gzipAsync(JSON.stringify(map))
      .then(buff => this._s3Client.putObject(Object.assign({ Key: this._mapFileName, Body: buff }, mapUploadParams)).promise());
  }

  * computeRemoteFilesStats() {
    const params = Object.assign({}, this._s3BaseParams);
    let hasNext = true;
    const remoteFilesStats = {};
    while (hasNext) {
      const { Contents, IsTruncated, NextContinuationToken } = yield this._s3Client.listObjectsV2(params).promise();
      for (const item of Contents) {
        // TODO: in case of user input, may be nested
        if (item.Key === this._mapFileName) continue;
        remoteFilesStats[item.Key] = item;
      }
      hasNext = IsTruncated;
      params.ContinuationToken = NextContinuationToken;
    }
    return remoteFilesStats;
  }

  * getRemoteFilesStats() {
    const remoteStoredMap = yield this.getRemoteHashMap(this._s3BaseParams);
    return remoteStoredMap ? JSON.parse(remoteStoredMap) : (yield this.computeRemoteFilesStats());
  }

  _uploadObject(fileName, fileData, basePath) {
    const shouldBeZipped = this._shouldGzip(fileName);
    const fStream = fs.createReadStream(path.join(basePath, fileName));
    const putParams = Object.assign({
      ACL: 'public-read',
      Key: fileName,
      Body: shouldBeZipped ? gzipStream(fStream) : fStream,
      ContentMD5: fileData.contentMD5,
    }, this._s3BaseParams);

    if (shouldBeZipped) {
      putParams.ContentEncoding = 'gzip';
    }

    return this._s3Client.putObject(putParams).promise();
  }

  _shouldGzip(fileName) {
    if (this._gzip) {
      if (Array.isArray(this._gzip)) {
        const extName = path.extname(fileName).substring(1).toLowerCase();
        if (extName) return this._gzip.includes(extName);
      } else {
        return true;
      }
    }
  }
}

module.exports.getInstance = (s3Client, params) => new S3Helper(s3Client, params);
