'use strict';

const sanitizeHtml = require('sanitize-html');

module.exports = function HTMLToText(HTML) {
  return sanitizeHtml(HTML, {
    allowedTags: [],
    allowedAttributes: {},
  });
}