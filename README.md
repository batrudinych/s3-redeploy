# s3-redeploy
Rework of s3-deploy package

# Module status: WIP until 0.1.0 release

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
