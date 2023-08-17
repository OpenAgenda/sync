"use strict";

const _ = require( 'lodash' );
const sanitizeHtml = require( 'sanitize-html' );
const TurndownService = require( 'turndown' );

const turndownService = new TurndownService();

module.exports = ( input, options = {} ) => {

  const { max, suffix, filter, htmlToText, htmlToMarkdown, defaultText } = Object.assign( {
    htmlToText: false,
    max: null,
    suffix: '',
    filter: [],
    htmlToMarkdown: false,
    defaultText: ''
  }, options );

  let text = htmlToText ? sanitizeHtml( input, { allowedTags: [], allowedAttributes: {} } ) : input;

  if ( !text ) return defaultText;

  if ( htmlToMarkdown ) {
    text = turndownService.turndown( text );
  }

  if ( max && text.length > max ) {
    text = text.substr( 0, max - suffix.length - 1 ) + suffix;
  }

  [].concat( filter ).forEach( f => {
    const filterPair = [].concat( f );
    const [ rgx, replaceWith ] = [ _.get( filterPair, '0' ), _.get( filterPair, '1', ' ' ) ];

    text = text.replace( rgx, replaceWith );
  } );

  return text;

}