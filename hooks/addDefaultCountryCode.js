'use strict';

module.exports = function addDefaultCountryCode(countryCode) {
  return async (context, next) => {
    await next();

    const { result } = context;

    if (!result.countryCode && countryCode) {
      result.countryCode = countryCode;
    }
  };
};
