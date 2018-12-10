# s3-redeploy

Node.js utility to sync files to Amazon S3 and invalidate CloudFront distributions.

# Module status: WIP until 1.0.0 release

## Usage

**Node.js >= 6.0.0 is required**

npm >= 5.2.0
```bash
$ npx s3-redeploy --bucket bucketName --pattern './**' --cwd ./folder-to-sync
```

npm < 5.2.0

```bash
$ npm i --global s3-redeploy
$ s3-redeploy --bucket bucketName --pattern './**' --cwd ./folder-to-sync
```

#### Options
```
--bucket
``` 
*Mandatory.* Name of S3 bucket where to sync the data
```
--cwd
```
*Optional.* Path to folder to treat as current working one. Defaults to `process.cwd()`
```
--pattern
```
*Optional.* Glob pattern, applied to the `cwd` directory. Defaults to `./**`, which means all the files inside the current directory and subdirectories will be processed. **Should be passed in quotes in linux to be treated as a string.** One more thing: `--cwd /home/user/website --pattern './**'` and `--cwd /home/user --pattern './website/**'` means different things. In the second case, all the file names will have `website/` prefix comparing to the results of the first case. **If no files match the pattern, the script will exit and leave bucket as is. This is done in order to prevent occasional bucket clearance due to wrong `pattern`/`cwd` combination**
```
--gzip
```
*Optional.* Indicates whether the content should be gzipped. A corresponding `Content-Encoding: gzip` header is added to objects being uploaded. If an array of extensions passed, only matching files will be gzipped. Array should be represented as a semicolon-separated list of extensions without dots. Example: `--gzip 'html;js;css'`.
```
--profile
```
*Optional.* Name of AWS profile to be used by AWS SDK. See [AWS Docs](https://docs.aws.amazon.com/cli/latest/topic/config-vars.html). If a region is specified in the credentials file under profile, it takes precedence over `--region` value
```
--region
```
*Optional.* Name of the region, where to apply the changes.
```
--cf-dist-id X
```
*Optional.* Id of CloudFront distribution to invalidate.
```
--cf-inv-paths /about;/home
```
*Optional.* Semicolon-separated list of paths to invalidate in CloudFront. Example: '/images/image1.jpg;/assets/\*'. Default value is '/\*'.
```
--ignore-map
```
*Optional.* Dictionary of files and correspondent hashes will be ignored upon difference computation. This is helpful if state of S3 bucket was changed manually (not through s3-redeploy script) but the dictionary hasn't changed. In this case, the dictionary state will be omitted during computation and at the same time **a new dictionary will be computed and uploaded to S3** so it could be used in further invocations
```
--no-map
```
*Optional.* Use this flag to store and use no file hashes dictionary at all. Each script invocation will seek through the whole bucket and gather ETags. **If bucket already contains a dictionary file, it will remain as is but won't be used. You have to remove it manually in order to get rid of it**
```
--no-rm
```
*Optional.* By default all the removed locally files will be also removed from S3 during sync. Use this flag to override default behavior and upload new files / update changed ones only. No files will be removed from S3. At the same time, the file hashes map will be updated to mirror relevant S3 bucket state properly.
```
--concurrency X
```
*Optional.* Sets the maximum possible amount of network / file system operations to be ran in parallel. In particular, it means that files uploading will be performed in parallel. The same is true for file system operations. Defaults to 5. *Note:* it is safe to run file system operations in parallel due to streams API usage
```
--file-name
```
*Optional.* Utility uploads a file containing md5 hashes upon folder sync. This file is used during the sync operation and lets to minimize amount of network requests and computations. Defaults to `_s3-rd.<bucket name>.json`. **If file name changes, the file with old name will still remain in the bucket until a new sync performed**
```
--cache X
```
*Optional.* Sets `Cache-Control: max-age=X` for uploaded files. Must be passed in seconds. By default nothing is set.

A simple lightweight validation process is implemented, but it is still possible to pass arguments in wrong format, e.g. `--file-name` is not checked against regex.

## Backgorund

Package provides an ability to sync a local folder with an Amazon S3 bucket and create an invalidation for a CloudFront distribution. Extremely helpful if you use S3 bucket as a hosting for your website.

The package has a really small amount of only well known and handy dependencies. It also uses no transpilers, etc., which means the size of package is pretty small and contains no garbage dependencies.

The idea was inspired by [s3-deploy](https://www.npmjs.com/package/s3-deploy) but another approach to work out the sync process has been taken. The set of functionality is also slightly different. Feel free to submit and issue or a feature request if something crucial is missing.

#### How it works

The script lets one to sync a local state to S3 bucket and, if needed, invalidate a CloudFront distribution by id. All the manipulations are performed through AWS SDK for Node.js. Script computes MD5 hashes for glob pattern compatible files and compares it to hashes of S3-stored objects. Based on hashes, it computes difference and uploads / removes only certain files.

Here are the key features:
* A dictionary of file hashes, which mirrors state of the file system, is built and uploaded to the bucket. It increases processing speed and decreases amount of round trips to S3. It also lets to distinguish states difference. As it contains only file hashes, it is completely secure to store it. Anyway, you still able to omit dictionary usage
* There are no unnecessary updates. If ETag (MD5) of file in S3 is equal to MD5 of locally stored file, it won't be uploaded. A dictionary is handy here, there is no need to query for ETag of each file as we have them all in single file already
* Dictionary usage lets one to abstract from AWS S3 ETags, which may be or may be not a MD5 hash. File, being computed for a local state, guarantees that all the changes will be spotted correctly
* Network / file system operations are done in parallel. You are still able to do everything sequentially using `concurrency` parameter
* There is an ability to set S3 object Cache-Control header using `--cache` parameter
* `--gzip` parameter lets one to control files compression
* Mime types are automatically computed by extension and set for each S3 object

**IMPORTANT:** If you change the state of bucket manually, the contents of the dictionary will not be updated. Thus, perform all the bucket update operations through the script or consider manual dictionary removal / `--ignore-map` flag usage, which will let the dictionary to be computed again and stored on the next script invocation.

## Tests

Describe and show how to run the tests with code examples.

## Contributors

Let people know how they can dive into the project, include important links to things like issue trackers, irc, twitter accounts if applicable.

## License

MIT


## TODO:
* fix versions in package.json
* add Travis and coverall + badges
* improve logging
### Would be nice to do in future:
* build redirect objects
* add verbose / silent flags
* verify work with paths, etc. on Windows
* use maps instead of objects

### Additional things to consider:
* check what could be done with versions and prefixes for S3 objects
* take a look at ACL:private for hash map
