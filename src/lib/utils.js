'use strict';

const glob = require('glob');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

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
module.exports.gzipAsync =
  data => new Promise((resolve, reject) => zlib.gzip(data, (err, result) => err ? reject(err) : resolve(result)));

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
module.exports.fsStatAsync =
  path => new Promise((resolve, reject) => fs.stat(path, (err, stats) => err ? reject(err) : resolve(stats)));

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

/**
 * A helper-function to verify if file needs to be zipped
 * @param fileName
 * @param gzip - Value of gzip cmd parameter
 * @returns {Boolean}
 * @private
 */
module.exports.shouldGzip = (fileName, gzip) => {
  if (gzip) {
    if (Array.isArray(gzip)) {
      const extName = path.extname(fileName).substring(1).toLowerCase();
      if (extName) return gzip.includes(extName);
    } else {
      return true;
    }
  }
};

/**
 * Transform string in dash case to camel case
 * @param str
 * @returns {String}
 */
module.exports.dashToCamel = str => {
  if (!str) return '';

  const parts = str.split('-').filter(Boolean);
  let result = parts.splice(0, 1)[0].toLowerCase();
  for (const part of parts) {
    result += part[0].toUpperCase() + part.substring(1).toLowerCase();
  }
  return result;
};

/**
 * Checks whether value represents a positive integer or not
 * @param val
 * @returns {boolean}
 */
module.exports.isPositiveInteger =
  val => !isNaN(val) && String(parseInt(val, 10)) === String(val) && parseInt(val, 10) > 0;
