'use strict';

const isURL200 = require('./isURL200.js');
const HTMLToText = require('./HTMLToText.js');
const markdownToText = require('./markdownToText.js');
const convertToTextAndTruncate = require('./convertToTextAndTruncate.js');

module.exports = {
  isURL200,
  HTMLToText,
  markdownToText,
  convertToTextAndTruncate,
};
