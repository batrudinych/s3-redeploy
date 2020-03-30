'use strict';

const { parallel, gzipStream, gzipAsync, gunzipAsync } = require('./utils');
const fs = require('fs');
const path = require('path');
const mime = require('mime');

/**
 * A wrapper class for handling S3-related operations
 */
class S3Helper {
  constructor(s3Client, params) {
    this._noMap = params.noMap;
    this._gzip = params.gzip;
    this._mapFileName = params.fileName;
    this._keyPrefix = params.prefix + '/';
    this._concurrency = params.concurrency;
    this._s3Client = s3Client;

    const cacheControl = [];

    if (params.cache) {
      cacheControl.push('max-age=' + params.cache);
    }

    if (params.immutable) {
      cacheControl.push('immutable');
    }

    if (cacheControl.length) {
      this._cacheControl = cacheControl.join(', ');
    }
  }

  /**
   * Remove objects (in batches) from S3 according to the passed map. Keys are used as file paths in S3
   * @param keys - List of file names
   */
  deleteObjects(keys) {
    const allObjects = keys.map(Key => ({ Key: this._keyPrefix + Key }));
    const batchSize = 1000;
    const batchesCount = Math.ceil(allObjects.length / batchSize);
    const batches = [];
    for (let i = 0; i < batchesCount; i++) {
      const startIndex = i * batchSize;
      batches.push(allObjects.slice(startIndex, startIndex + batchSize));
    }
    return parallel(
      batches,
      batch =>
        this._s3Client.deleteObjects({ Delete: { Objects: batch } }).promise(),
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
      Object.keys(toUpload.hashes),
      fileName => this._uploadObject(fileName, toUpload, basePath),
      this._concurrency
    );
  }

  /**
   * Retrieve an object containing map of file hashes from S3
   * @returns {Promise<Object>} - Map of file hashes
   */
  getRemoteHashesMap() {
    return this._s3Client.getObject({ Key: this._keyPrefix + this._mapFileName })
      .promise()
      .then(data => data.ContentEncoding === 'gzip' ? gunzipAsync(data.Body) : data.Body)
      .then(buff => JSON.parse(buff.toString('utf8')))
      .catch(err => {
        if (err.statusCode === 404) return null;
        throw err;
      });
  }

  /**
   * Upload map of file hashes to S3
   * @param map - Map of file hashes
   * @returns {Promise<>}
   */
  storeRemoteHashesMap(map) {
    const mapUploadParams = { ContentEncoding: 'gzip' };
    return gzipAsync(JSON.stringify(map))
      .then(buff => this._s3Client.putObject(Object.assign({
        Key: this._keyPrefix + this._mapFileName,
        Body: buff,
      }, mapUploadParams)).promise());
  }

  /**
   * Retrieve all the objects data from S3 using listObjectsV2 method and
   * builds a map of file data. Omits the map of file hashes object. A generator-function.
   * @returns {Object}
   */
  * computeRemoteFilesStats() {
    const params = { Prefix: this._keyPrefix };
    let hasNext = true;
    const remoteFilesStats = {};
    while (hasNext) {
      const { Contents, IsTruncated, NextContinuationToken } = yield this._s3Client.listObjectsV2(params).promise();
      for (const item of Contents) {
        if (!this._noMap && item.Key === this._keyPrefix + this._mapFileName) continue;
        remoteFilesStats[item.Key] = item.ETag.slice(1, -1);
      }
      hasNext = IsTruncated;
      params.ContinuationToken = NextContinuationToken;
    }
    return remoteFilesStats;
  }

  /**
   * Upload a local file onto S3. Uses stream API
   * @param fileName - File name, relative to cwd
   * @param toUpload - Map of files hash data
   * @param basePath - Base path, absolute, based on cwd
   * @returns {Promise<>}
   * @private
   */
  _uploadObject(fileName, toUpload, basePath) {
    const shouldBeZipped = toUpload.gzip[fileName];
    const contentType = mime.getType(fileName);
    const fStream = fs.createReadStream(path.join(basePath, fileName));
    const uploadParams = {
      ACL: 'public-read',
      Key: this._keyPrefix + fileName,
      Body: shouldBeZipped ? gzipStream(fStream) : fStream,
      ContentMD5: Buffer.from(toUpload.hashes[fileName], 'hex').toString('base64'),
    };

    if (contentType) {
      uploadParams.ContentType = contentType;
    }

    if (shouldBeZipped) {
      uploadParams.ContentEncoding = 'gzip';
    }

    if (this._cacheControl) {
      uploadParams.CacheControl = this._cacheControl;
    }

    return this._s3Client.upload(uploadParams).promise();
  }
}

module.exports.getInstance = (s3Client, params) => new S3Helper(s3Client, params);
