'use strict';

const VError = require('@openagenda/verror');

module.exports = class OaError extends VError {
  name = 'OaError'
}
