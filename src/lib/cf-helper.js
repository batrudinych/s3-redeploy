module.exports.invalidate = (awsCF, distId, paths = ['/*']) =>
  awsCF.createInvalidation({
    DistributionId: distId,
    InvalidationBatch: {
      CallerReference: `s3-redeploy-${Date.now().toString().slice(0, -3)}`,
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
    },
  }).promise();
