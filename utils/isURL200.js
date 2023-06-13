'use strict';

const axios = require('axios');

const cleanImageURL = require('./cleanImageURL');

module.exports = function isURL200(url) {
  if (!url) {
    return false;
  }

  let cleanURL;

  try {
    cleanURL = cleanImageURL(url);
  } catch (e) {
    return false;
  }
  return axios.head(cleanURL)
    .then(({ status }) => status === 200)
    .catch(() => false);
}
