# s3-redeploy

Node.js utility to sync files to Amazon S3.

# Module status: WIP until 0.1.0 release

## Usage

**Node.js >= 6.0.0 is required**

#### As a script:

npm >= 5.2.0
```bash
$ npx s3-redeploy --bucket bucketName --pattern './**' --cwd ./folder-to-sync
```

npm < 5.2.0

```bash
$ npm i --global s3-redeploy
$ s3-redeploy --bucket bucketName --pattern './**' --cwd ./folder-to-sync
```

#### As a module:

```bash
$ npm i -S s3-redeploy
```

```js
const s3Redeploy = require('s3-redeploy')

const options = { bucket: 'bucketName' };

s3Redeploy(options)
  .then(() => console.log('Files have been successfully deployed')
  .catch(e => console.error('Uploading failed'));
```

#### Options
**NOTE:** if package is used as a module, option name should be in camel case, e.g. `--file-name` should become `fileName`
```
--bucket
``` 
*Mandatory.* Name of bucket where to sync the data
```
--cwd
```
*Optional.* Path to folder to treat as current working one. Defaults to `process.cwd()`
```
--pattern
```
*Optional.* Glob pattern, applied to the `cwd` directory. Defaults to `./**`, which means all the files inside the current directory and subdirectories will be processed. **Should be passed in quotes in linux to be treated as a string.**
```
--gzip
```
*Optional.* Indicates whether the content should be gzipped. A corresponding `Content-Encoding: gzip` header added to uploading objects. If an array of extensions passed, only matching files will be gzipped, otherwise all the files are gzipped. Array should be represented as a comma-separated list of extensions without dots. Example: `--gzip html,js,css`
```
--profile
```
*Optional.* Name of AWS profile to be used by AWS SDK. See [AWS Docs](https://docs.aws.amazon.com/cli/latest/topic/config-vars.html)
```
--region
```
Name of the region, where to apply the changes.
```
--concurrency X
```
*Optional.* Parameter sets the maximum possible amount of network / file system operations to be ran in parallel. Defaults to 5. *Note:* it is safe to run file system operations in parallel due to streams usage
```
--file-name
```
*Optional.* Utility uploads a file, containing md5 hashes, upon folder sync. This file is used during the sync operation and lets to minimize amount of network requests and computations. Defaults to `_s3-rd.<bucket name>.json`
```
--cache X
```
*Optional.* Sets `Cache-Control: max-age=X` for uploaded files. Must be passed in seconds. By default nothing is set.

## Backgorund

Package provides an ability to sync a local folder with an Amazon S3 bucket and create an invalidation for a CloudFront distribution. Extremely helpful if you use S3 bucket as a hosting for your website.

The module itself may be both executed as a script from the command line and imported as a module into the application. The idea was inspired by [s3-deploy](https://www.npmjs.com/package/s3-deploy) but another approach to work out the sync process was taken. The set of functionality is also slightly different.

#### How it works

In order to decrease amount of S3 invocations and increase processing speed, MD5 hashes dictionary is built for all the local files. The dictionary is uploaded along with other files and is used during further updates. Instead of querying S3 for ETags, the S3-stored dictionary is compared with local one. Thus, only changed files are updated.

**IMPORTANT:** If you change the state of bucket manually, the contents of the dictionary will not be updated. Thus, perform all the bucket update operations through the script or consider manual dictionary removal, which will let the dictionary to be computed again on the next script invocation.

## Tests

Describe and show how to run the tests with code examples.

## Contributors

Let people know how they can dive into the project, include important links to things like issue trackers, irc, twitter accounts if applicable.

## License

MIT


TODO:
* add mime types for S3 objects (based on extension)
* add a possibility to ignore map
* add a possibility to invalidate cloudfront distribution
* use maps instead of objects
* fix versions in package.json
* add command line parameters validation (both required / optional and type)
* precommit hook
* unit tests + proper error handling
* add Travis and coverall + badges
* build redirect objects
* check on Windows

Additional things to consider:
* check what could be done with versions and prefixes for S3 objects
* take a look at ACL:private for hash map
