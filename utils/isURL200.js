'use strict';

const axios = require('axios');

const cleanImageURL = require('./cleanImageURL');

module.exports = async function isURL200(url) {
  if (!url) {
    return false;
  }

  let cleanURL;

  try {
    cleanURL = cleanImageURL(url);
  } catch (e) {
    return false;
  }

  try {
    return (await axios.head(cleanURL)).status === 200;
  } catch (e) {}

  try {
    return (await axios.get(cleanURL)).status === 200;
  } catch (e) {}

  return false;
}
