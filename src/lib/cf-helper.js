'use strict';

/**
 * Creates an invalidation for a given distribution and paths
 * @param cfClient - AWS SDK CloudFront instance
 * @param distId - Distribution id
 * @param paths - List of paths to invalidate
 * @returns {Promise<PromiseResult<CloudFront.CreateInvalidationResult, AWSError>>}
 */
module.exports.invalidate = (cfClient, distId, paths = ['/*']) =>
  cfClient.createInvalidation({
    DistributionId: distId,
    InvalidationBatch: {
      CallerReference: `s3-redeploy-${Date.now()}`,
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
    },
  }).promise();
