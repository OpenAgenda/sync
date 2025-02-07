'use strict';

const HTMLToText = require('./HTMLToText');
const {
   fromMarkdownToHTML
} = require('@openagenda/md');

module.exports = function MarkdownToText(md) {
  return HTMLToText(fromMarkdownToHTML(md));
}