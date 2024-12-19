'use strict';

const _ = require('lodash');
const castTimings = require('./utils/castTimings');

module.exports = (syncTimings, itemToUpdateTimings) => {
  return _.isEqual(
    _.orderBy(castTimings(_.flatten(syncTimings)), ['begin', 'end']),
    _.orderBy(castTimings(itemToUpdateTimings), ['begin', 'end'])
  );
}