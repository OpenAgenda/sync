'use strict';

const moment = require('moment');

module.exports = function filterTimings() {
  return async (context, next) => {
    await next();

    const { result } = context;

    if (result && result.timings && result.timings.length) {
      result.timings = result.timings.filter(timing =>
        (timing && timing.begin && timing.end && moment(timing.begin).isBefore(timing.end))
      );
    }
  };
};
