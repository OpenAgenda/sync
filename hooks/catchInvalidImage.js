'use strict';

const isURL200 = require('../utils/isURL200');
const upStats = require('../lib/upStats');

module.exports = function catchInvalidImage() {
  return async (context, next) => {
    await next();

    const { result, params } = context;
    const { noBailOnInvalidImage, defaultImageUrl, stats } = params;

    if (
      noBailOnInvalidImage
      && result.image && !(await isURL200(result.image.url))
    ) {
      upStats(stats, 'invalidImages');
      result.image = defaultImageUrl ? { url: defaultImageUrl } : null;
    }
  };
};
