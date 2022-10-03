'use strict';

const OaError = require('../errors/OaError');

module.exports = async function potentialOaError(expr) {
  try {
    return await expr;
  } catch (e) {
    throw new OaError(e);
  }
};
