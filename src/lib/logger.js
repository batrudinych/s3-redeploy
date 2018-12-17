'use strict';

const levels = {
  error: 0,
  info: 1,
  verbose: 2,
  debug: 3,
};

class Logger {
  constructor() {
    this._level = levels.info;
  }

  init({ level } = {}) {
    if (levels[level] !== undefined) {
      this._level = levels[level];
    }
    return this;
  }

  info() {
    if (this._level >= levels.info) {
      console.log.apply(null, arguments);
    }
  }

  verbose() {
    if (this._level >= levels.verbose) {
      console.log.apply(null, arguments);
    }
  }

  error() {
    console.log.apply(null, arguments);
  }
}

const loggerInstance = new Logger();

module.exports = {
  init: params => loggerInstance.init(params),
  get: () => loggerInstance,
};
