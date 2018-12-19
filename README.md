[![Build Status](https://travis-ci.org/batrudinych/s3-redeploy.svg?branch=master)](https://travis-ci.org/batrudinych/s3-redeploy)
[![Coverage Status](https://coveralls.io/repos/github/batrudinych/s3-redeploy/badge.svg?branch=master)](https://coveralls.io/github/batrudinych/s3-redeploy?branch=master)
[![](https://img.shields.io/node/v/s3-redeploy.svg)](https://www.npmjs.com/package/s3-redeploy)
[![](https://img.shields.io/npm/v/s3-redeploy.svg)](https://www.npmjs.com/package/s3-redeploy)
[![](https://img.shields.io/npm/dw/s3-redeploy.svg)](https://www.npmjs.com/package/s3-redeploy)

# s3-redeploy

Node.js utility to sync files to Amazon S3 and invalidate CloudFront distributions.

## Usage

npm >= 5.2.0
```bash
$ npx s3-redeploy --bucket bucketName --cwd ./folder-to-sync
```

npm < 5.2.0

```bash
$ npm i --global s3-redeploy
$ s3-redeploy --bucket bucketName --cwd ./folder-to-sync
```

#### Options
| Parameter name 	| Mandatory 	| Description                                                                                                                                                                                                                                                                                                                                                                                                                              	| Default value          	| Usage examples                                                                                                                               	        |
|----------------	|-----------	|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------	|------------------------	|----------------------------------------------------------------------------------------------------------------------------------------------	        |
| --bucket       	| yes       	| Name of S3 bucket where to sync the data                                                                                                                                                                                                                                                                                                                                                                                                	| -                      	| --bucket s3_bucket_name                                                                                                                      	        |
| --cwd          	| no        	| Path to folder to treat as current working one. Glob pattern is applied inside this directory                                                                                                                                                                                                                                                                                                                                           	| process.cwd()          	| --cwd ./website<br> --cwd /home/user/website                                                                                                 	        |
| --pattern      	| no        	| Glob pattern, applied within the `cwd` directory. **If no files match the pattern, the script will exit and leave bucket as is. This is done in order to prevent occasional bucket clearance due to wrong `pattern`/`cwd` combination**                                                                                                                                                                                                 	| './**'                 	| --pattern './\*\*.{js,html}'<br> `**` works as a `globstar`, see [docs](https://www.gnu.org/software/bash/manual/html_node/The-Shopt-Builtin.html) 	|
| --gzip         	| no        	| Indicates whether the content should be gzipped. A corresponding `Content-Encoding: gzip` header is added to objects being uploaded. If an array of extensions passed, only matching files will be gzipped. Array should be represented as a semicolon-separated list of extensions without dots.                                                                                                                                       	| false                  	| --gzip<br> --gzip 'html;js;css'                                                                                                              	        |
| --profile      	| no        	| Name of AWS profile to be used by AWS SDK. See [AWS Docs](https://docs.aws.amazon.com/cli/latest/topic/config-vars.html). If a region is specified in the credentials file under profile, it takes precedence over `--region` value                                                                                                                                                                                                     	| -                      	| --profile stage_profile                                                                                                                      	        |
| --region       	| no        	| Name of the AWS region, where to apply the changes                                                                                                                                                                                                                                                                                                                                                                                      	| -                      	| --region eu-west-1                                                                                                                           	        |
| --cf-dist-id   	| no        	| Id of CloudFront distribution to invalidate once sync is completed                                                                                                                                                                                                                                                                                                                                                                      	| -                      	| --cd-dist-id EDFDVBD632BHDS5                                                                                                                 	        |
| --cf-inv-paths 	| no        	| Semicolon-separated list of paths to invalidate in CloudFront                                                                                                                                                                                                                                                                                                                                                                           	| '/*'                   	| --cf-inv-paths '/about;/help'                                                                                                                	        |
| --ignore-map   	| no        	| Dictionary of files and correspondent hashes will be ignored upon difference computation during sync process. This is helpful if state of S3 bucket has been changed manually (not through s3-redeploy script) but the dictionary remained unchanged. The dictionary state will be omitted during computation and at the same time **a new dictionary will be computed and uploaded to S3** so it could be used in further invocations. 	| false                  	| --ignore-map                                                                                                                                 	        |
| --no-map       	| no        	| Use this flag to **store and use no file hashes dictionary** at all. Each script invocation will result in uploading of all the files stored locally. **If bucket already contains a dictionary file, it will be removed on next script invocation**                                                                                                                              	| false                  	| --no-map                                                                                                                                         	    |
| --no-rm        	| no        	| By default all the removed locally files will be also removed from S3 during sync. Use this flag to override default behavior and upload new files / update changed ones only. No files will be removed from S3. At the same time, the file hashes map (if used) will be updated to mirror relevant S3 bucket state properly.                                                                                                           	| false                  	| --no-rm                                                                                                                                      	        |
| --concurrency  	| no        	| Sets the maximum possible amount of network / file system operations to be ran in parallel. In particular, it means that files uploading will be performed in parallel. The same is true for file system operations. *Note:* it is safe to run file system operations in parallel due to streams API usage                                                                                                                              	| 5                      	| --concurrency 8                                                                                                                              	        |
| --file-name    	| no        	| Utility by default uploads a file containing md5 hashes upon folder sync. This file is used during the sync operation and lets to minimize amount of network requests and computations. **If file name changes, the file with old name will still remain in the bucket until a new sync performed**                                                                                                                                     	| `_s3-rd.<bucket>.json` 	| --file-name hashes_map.json                                                                                                                  	        |
| --cache        	| no        	| Sets `Cache-Control: max-age=X` for uploaded files. Must be passed in seconds                                                                                                                                                                                                                                                                                                                                                           	| -                      	| --cache 3600                                                                                                                                 	        |
| --immutable       | no        	| Sets `Cache-Control: immutable` for uploaded files. For more info see [article](https://hacks.mozilla.org/2017/01/using-immutable-caching-to-speed-up-the-web/). Also check browsers support [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#Browser_compatibility)                                                                                                                                	    | -                      	| --immutable                                                                                                                                 	        |
| --verbose      	| no        	| Adds additional info to logs: execution parameters, list of local file system objects, list of objects to be uploaded, list of objects to be deleted                                                                                                                                                                                                                                                                               	    | false                    	| --verbose                                                                                                                                 	        |

A simple lightweight validation process is implemented, but it is still possible to pass arguments in wrong format, e.g. `--file-name` is not checked against regex.

## Backgorund

Package provides an ability to sync a local folder with an Amazon S3 bucket and create an invalidation for a CloudFront distribution.
Extremely helpful if you use S3 bucket as a hosting for your website.

The package has a really small amount of only well known and handy dependencies.
It also uses no transpilers, etc., which means the size of package is rather small and contains no garbage dependencies.

The idea was inspired by [s3-deploy](https://www.npmjs.com/package/s3-deploy) but another approach to work out the sync process has been taken.
The default assumptions and set of functionality is also slightly different. Feel free to submit an issue or a feature request if something crucial is missing.

#### How it works

In general, the script lets one to sync a local folder state to S3 bucket and, if needed, creates an invalidation for a CloudFront distribution by id.
All the S3 bucket and CloudFront distribution state manipulations are performed through AWS SDK for Node.js.
Script computes MD5 hashes for local files, filtered by `cwd`/`pattern` parameters combination and builds a so-called map of hashes.
Then, S3-stored objects' map of hashes is built. If no objects persist in S3, bucket is filled with local files and a map for locally stored files is uploaded.
If there are already objects in bucket, script will look for a file with hashes map. It will be used in order to detect the difference between local and S3 states.
If none is found, ETags of S3 objects are used to determine possible changes. **Keep in mind that AWS may fill ETag with non-MD5 value in certain cases. See [AWS Docs](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTCommonResponseHeaders.html) on that.**
So, same files may be treated as different. Anyway, if ETags do not match, a local version of file will be re-uploaded. Thus, bucket will be synced with local state.
Once difference is computed, it will be applied to S3: removed locally files will be also removed from S3, updated locally files will be uploaded to S3.
Single object's ETag is set to file's MD5 upon uploading.
Along with difference application, the updated map of hashes is uploaded to S3.
If CloudFront distribution id is supplied, an invalidation will be created once sync process is complete.

**A remotely stored dictionary is the main advantage of this package.** It is a simple, gzipped file with a description of current state of S3 bucket.
It drastically increases processing speed and provides an ability to decrease number of S3 requests.

The process may be tuned using flags mentioned above in different ways. See list of options.

**IMPORTANT:** If you change the state of bucket manually, the contents of the dictionary will not be updated.
Thus, perform all the bucket update operations through the script or consider manual dictionary removal / `--ignore-map` flag usage, which will let the dictionary to be computed again and stored on the next script invocation.

## Tests
Clone the repo and run the following command:
```
npm i && npm run test
```

## License

MIT

## Would be nice to do in future:
* build redirect objects
* use maps instead of objects
* ability to list file names only (with no processing)

## Additional things to consider:
* check what could be done with versions and prefixes for S3 objects
* take a look at ACL:private for hash map
* copy objects instead of uploading again on meta change? tbc
