'use strict';

const axios = require('axios');

module.exports = function isURL200(url) {
  if (!url) {
    return false;
  }

  return axios.head(url)
    .then(({ status }) => status === 200)
    .catch(() => false);
}
