'use strict';

const axios = require('axios');

const cleanURL = require('./cleanURL');

module.exports = async function isURL200(url) {
  if (!url) {
    return false;
  }

  let clean;

  try {
    clean = cleanURL(url);
  } catch (e) {
    return false;
  }

  try {
    return (await axios.head(clean)).status === 200;
  } catch (e) {}

  try {
    return (await axios.get(clean)).status === 200;
  } catch (e) {}

  return false;
}
