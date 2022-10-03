'use strict';

const moment = require('moment');

module.exports = function castTimings(timings) {
  return timings.map(v => ({
    begin: moment(v.begin).toISOString(),
    end: moment(v.end).toISOString()
  }));
};
