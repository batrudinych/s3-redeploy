# s3-redeploy
Rework of s3-deploy package

# Module status: WIP until 0.1.0 release

* In order to do check it with s3 mock:
  * run install --no-save mock-aws-s3
* correct the following line in mock-aws-s3/lib/mock: <code>line 210 "if (truncated && search.Delimiter) {"</code> -> <code>"if (truncated) {"</code>
* comment lines 229 -> 231 s3Helper.deleteObjects of function:
  * <code>else { errors.push(file); }</code>

TODO:
* use maps instead of objects
* fix versions in package.json
* build more comprehensive S3 parameters for upload / download (content-type, cache, etc)
* add cloudfront invalidation
* extend command line parameters list: aws profile, custom hash map name, custom hash algorithm...
* add command line parameters validation (both required / optional and type)
* refactor code -> spread lib to modules, think about shared params (like s3Client)
* take a look at ACL:private for hash map
* build redirect objects
* precommit hook
* add a local hash map and add a possibility to use it upon update
* add jsdocs / comments to methods
* unit tests + proper error handling
* check on Windows
* add Travis and coverall + badges

Additional things to consider:
* check what could be done with versions and prefixes for S3 objects