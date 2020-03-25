'use strict';

const _ = require('lodash');
const VError = require('verror');
const SourceError = require('./SourceError');

function findCauseByType(err, type) {
  let cause;

  for (cause = err; cause !== null; cause = VError.cause(cause)) {
    if (cause instanceof type) {
      return cause;
    }
  }

  return null;
}

function pushTo(stats, key, value) {
  if (!_.get(stats, key)) {
    _.set(stats, key, []);
  }

  _.get(stats, key).push(value);
}

module.exports = function upStats(stats, key, errorOrIncrement = 1) {
  if (!stats) {
    return
  }

  if (errorOrIncrement instanceof VError) {
    const sourceError = findCauseByType(errorOrIncrement, SourceError);

    if (sourceError) {
      const info = VError.info(errorOrIncrement);
      const id = info.correspondenceId || info.eventId;

      switch (sourceError.message) {
        case 'Missing timings':
          pushTo(stats, 'sourceErrors.missingTimings', id);
          break;
        case 'Missing location':
          pushTo(stats, 'sourceErrors.missingLocation', id);
          break;
        default:
          break;
      }
    } else {
      const host = errorOrIncrement.isAxiosError
        ? new URL(errorOrIncrement.config.url).host
        : _.get(errorOrIncrement, 'response.request.host');

      if (host && host.split('.').slice(-2).join('.') === 'openagenda.com') {
        _.set(stats, 'oaRequestErrors', _.get(stats, 'oaRequestErrors', 0) + 1);
      }
    }

    _.set(stats, key, _.get(stats, key, 0) + 1);
  } else {
    _.set(stats, key, _.get(stats, key, 0) + errorOrIncrement);
  }
};
