const { readdirSync, readFileSync } = require( 'fs' );
const path = require( 'path' );

const matchId = str => str.match( /event\.(.*)\.json/ )[ 1 ];

module.exports = function listSavedEvents( directory, offset, limit ) {
  const files = readdirSync( path.join( directory, 'data' ) )
    .sort( ( a, b ) => matchId( a ) - matchId( b ) )
    .slice( offset, offset + limit );

  return files.map( v => JSON.parse( readFileSync( path.join( directory, 'data', v ), 'utf8' ) ) );
};
