'use strict';

const VError = require('verror');

module.exports = class OaError extends VError {
  name = 'OaError'
}
