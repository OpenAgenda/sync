'use strict';

const {
  isHTML
} = require('@openagenda/md');

const HTMLToText = require('./HTMLToText.js');
const markdownToText = require('./markdownToText.js');

function guessInputType(inputType) {
  return isHTML(inputType) ? 'HTML' : 'markdown';
}

function convertToText(input, type) {
  return (type ?? guessInputType(input)) === 'HTML' ? HTMLToText(input) : markdownToText(input).replace(/\n$/, '');
}

function isLastWordTruncated(text, truncated) {
  return text.split(' ').pop() !== truncated.split(' ').pop();
}

module.exports = function convertToTextAndTruncate(input, options = {}) {
  if (!input) {
    return;
  }
  if (typeof input === 'object') {
    return Object.keys(input).reduce((obj, lang) => ({
      ...obj,
      [lang]: convertToTextAndTruncate(input[lang], options),
    }), {});
  }

  const {
    inputType,
    truncateAtNewline = false,
    truncateWord = true,
    truncateSuffix = '',
    max,
  } = options;

  let editedText = inputType !== null ? convertToText(
    input,
    inputType,
  ) : input;

  if (truncateAtNewline) {
    editedText = editedText.split('\n').shift();
  }

  if (!max || editedText.length <= max) {
    return editedText;
  }

  const truncatedAtMax = editedText.substr(0, max - truncateSuffix?.length);

  if (truncateWord) {
    return truncatedAtMax + truncateSuffix;
  }

  if (isLastWordTruncated(editedText, truncatedAtMax)) {
    return editedText.split(' ').reduce(({ truncatedAtWord, endReached }, nextWord) => (
      (endReached || (truncatedAtWord.length + truncateSuffix?.length + nextWord.length + 1 >= max)) ? {
        endReached: true,
        truncatedAtWord,
      } : {
        endReached: false,
        truncatedAtWord: `${truncatedAtWord}${truncatedAtWord.length ? ' ' : ''}${nextWord}`
      }
    ), {
      truncatedAtWord: '',
      endReached: false,
    }).truncatedAtWord + truncateSuffix;
  }

  return editedText + truncateSuffix;
}
