const { parallel, gzipStream, gzipAsync, gunzipAsync } = require('./utils');
const fs = require('fs');
const path = require('path');

/**
 * A wrapper class for handling S3-related operations
 */
class S3Helper {
  constructor(s3Client, params) {
    this._cache = params.cache;
    this._gzip = params.gzip;
    this._mapFileName = params.fileName;
    this._concurrency = params.concurrency;
    this._s3Client = s3Client;
    this._s3BaseParams = { Bucket: params.bucket };
  }

  /**
   * Remove objects (in batches) from S3 according to the passed map. Keys are used as file paths in S3
   * @param toDelete - Map of file hashes
   */
  deleteObjects(toDelete) {
    const allObjects = Object.keys(toDelete).map(Key => ({ Key }));
    const batchSize = 1000;
    const batchesCount = Math.ceil(allObjects.length / batchSize);
    const batches = [];
    for (let i = 0; i < batchesCount; i++) {
      const startIndex = i * batchSize;
      batches.push(allObjects.slice(startIndex, startIndex + batchSize));
    }
    return parallel(
      batches,
      batch => this._s3Client.deleteObjects(Object.assign({ Delete: { Objects: batch } }, this._s3BaseParams)).promise(),
      this._concurrency
    );
  }

  /**
   * Upload objects to S3. Uses stream API. Keys are used as file paths in S3
   * @param toUpload - Map of file hashes
   * @param basePath
   */
  uploadObjects(toUpload, basePath) {
    return parallel(
      Object.keys(toUpload),
      fileName => this._uploadObject(fileName, toUpload[fileName], basePath),
      this._concurrency
    );
  }

  /**
   * Retrieve an object containing map of file hashes from S3
   * @returns {Promise<Object>} - Hashes map
   */
  getRemoteHashMap() {
    return this._s3Client.getObject(Object.assign({ Key: this._mapFileName }, this._s3BaseParams))
      .promise()
      .then(data => data.ContentEncoding === 'gzip' ? gunzipAsync(data.Body) : data.Body)
      .then(buff => JSON.parse(buff.toString('utf8')))
      .catch(err => {
        if (err.statusCode === 404) return null;
        throw err;
      });
  }

  /**
   * Upload file hashes map to S3
   * @param map - Hashes map
   * @returns {Promise<>}
   */
  storeRemoteHashMap(map) {
    const mapUploadParams = Object.assign({ ContentEncoding: 'gzip' }, this._s3BaseParams);
    return gzipAsync(JSON.stringify(map))
      .then(buff => this._s3Client.putObject(Object.assign({ Key: this._mapFileName, Body: buff }, mapUploadParams)).promise());
  }

  /**
   * Retrieve all the objects data from S3 using listObjectsV2 method and
   * builds a map of file data. Skips the hashes map object. A generator-function.
   * @returns {Object}
   */
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

  /**
   * Get or compute a map of file hashes from S3. A generator-function.
   * @returns {Object}
   */
  * getRemoteFilesStats() {
    const remoteStoredMap = yield this.getRemoteHashMap();
    return remoteStoredMap || (yield this.computeRemoteFilesStats());
  }

  /**
   * Upload a local file onto S3. Uses stream API
   * @param fileName - File name, relative to cwd
   * @param fileData - Object, containing hash data
   * @param basePath - Base path, absolute, based on cwd
   * @returns {Promise<>}
   * @private
   */
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

    if (this._cache) {
      putParams.CacheControl = 'max-age=' + this._cache;
    }

    return this._s3Client.putObject(putParams).promise();
  }

  /**
   * A helper-function to verify if file needs to be zipped
   * @param fileName
   * @returns {Boolean}
   * @private
   */
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
