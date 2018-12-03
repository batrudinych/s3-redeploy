class CommonError extends Error {
  constructor(message, additionalInfo) {
    super(message);
    Object.assign(this, additionalInfo);
    Error.captureStackTrace(this, CommonError);
  }
}

module.exports = CommonError;
