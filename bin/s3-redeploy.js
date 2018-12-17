#!/usr/bin/env node
'use strict';

const params = require('../src/lib/args-processor').parse(process.argv.slice(2));
const logger = require('../src/lib/logger').init({ level: params.verbose ? 'verbose' : 'info' });

require('../src')(params, logger)
  .then(() => logger.verbose('∾∾∾∾∾∾∾ Execution Complete ∾∾∾∾∾∾∾∾'))
  .catch(err => {
    logger.verbose('∾∾∾∾∾∾∾∾ Execution Failed ∾∾∾∾∾∾∾∾∾');
    logger.error('An error has been thrown');
    logger.error('Failure reason:', err.message);
    if (err.originalError) {
      logger.error('Original error:', err.originalError.message);
    }
    logger.verbose('Stack trace:');
    logger.verbose(err.stack);
    if (err.originalError) {
      logger.verbose('Original error stack trace:');
      logger.verbose(err.originalError.stack);
    }
    process.exit(1);
  });
