'use strict';

const isURL200 = require('../utils/isURL200');
const upStats = require('../lib/upStats');

module.exports = function catchInvalidImage() {
  return async (context, next) => {
    await next();

    const { agendaUid, result, noBailOnInvalidImage, defaultImageUrl, stats } = context;

    if (
      noBailOnInvalidImage
      && result.image && !(await isURL200(result.image.url))
    ) {
      const agendaStats = stats.agendas[agendaUid];
      upStats(agendaStats, 'invalidImages');
      result.image = defaultImageUrl ? { url: defaultImageUrl } : null;
    }
  };
};
