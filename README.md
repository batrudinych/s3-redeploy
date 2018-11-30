# s3-redeploy
Rework of s3-deploy package

# Module status: WIP until 0.1.0 release

Possible params:
* bucket <required> - name of s3 bucket, string
* region <optional> - name of the region, string
* cwd <optional> - path to folder to treat as current working one, string. Defaults to process.cwd()
* pattern <optional> - glob pattern, applied to the `cwd` directory. Should be passed in quotes in linux to be treated as a string.
* concurrency <optional> - number of requests to be ran in parallel. defaults to 5. affects network and file system requests
* file-name <optional> - name of the map of file hashes, string. defaults to `_s3-rd.<bucket name>.json`
* gzip [txt,html,...] <optional> - indicates whether the content should be gzipped. If an array of extensions passed, only matching files will be gzipped, otherwise all the files are gzipped. Array should be represented as a comma-separated list of extensions without dots.
* cache (in seconds) <optional> - sets max-age header for files. Value should be in seconds.
* profile <optional> - name of AWS profile

TODO:
* use maps instead of objects
* fix versions in package.json
* build more comprehensive S3 parameters for upload / download (mime type)
* add cloudfront invalidation
* extend command line parameters list: aws profile, custom hash algorithm...
* add command line parameters validation (both required / optional and type)
* precommit hook
* add a local hash map and add a possibility to use it upon update
* add jsdocs / comments to methods
* unit tests + proper error handling
* add Travis and coverall + badges
* build redirect objects
* check on Windows

Additional things to consider:
* check what could be done with versions and prefixes for S3 objects
* take a look at ACL:private for hash map
