'use strict';

const _ = require('lodash');
const castTimings = require('./castTimings');

module.exports = (syncTimings, itemToUpdateTimings) => {
  return _.isEqual(
    _.orderBy(castTimings(_.flatten(syncTimings)), ['begin', 'end']),
    _.orderBy(castTimings(itemToUpdateTimings), ['begin', 'end'])
  );
}