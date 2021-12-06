'use strict';

const VError = require('@openagenda/verror');

module.exports = class SourceError extends VError {
  name = 'SourceError'
}
