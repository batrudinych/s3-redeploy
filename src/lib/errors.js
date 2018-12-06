'use strict';

class CommonError extends Error {
  constructor(message, originalError) {
    super(message);
    if (originalError) {
      this.originalError = originalError;
    }
    Error.captureStackTrace(this, CommonError);
  }
}

module.exports = {
  CommonError,
};
