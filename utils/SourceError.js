'use strict';

const VError = require('verror');

module.exports = class SourceError extends VError {
  name = 'SourceError'
}
