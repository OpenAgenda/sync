'use strict';

const SourceError = require('../errors/SourceError');

module.exports = function throwMissingTimings() {
  return async (context, next) => {
    await next();

    const { result } = context;

    if (!result) {
      return;
    }

    if (!result.timings || !result.timings.length) {
      throw new SourceError('Missing timings');
    }
  };
};
