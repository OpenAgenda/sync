'use strict';

const moment = require('moment');

module.exports = function transformFlatTimings(flatTimingDuration) {
  return async (context, next) => {
    await next();

    const { result } = context;

    if (!flatTimingDuration || !result) {
      return;
    }

    if (result && result.timings && result.timings.length) {
      for (const timing of result.timings) {
        if (!timing) {
          continue;
        }

        if (timing.begin && timing.end && moment(timing.begin).isSame(timing.end)) {
          timing.end = moment(timing.end).add(flatTimingDuration, 'seconds').toDate();
        }
      }
    }
  };
};
