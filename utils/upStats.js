'use strict';

const _ = require('lodash');

module.exports = function upStats(stats, key, increment = 1) {
  if (stats) {
    _.set(stats, key, _.get(stats, key, 0) + increment);
  }
};
