const { promisify } = require( 'util' );

module.exports = function promisifyStore( store ) {

  const promisifiedStore = [ 'insert', 'update', 'remove' ].reduce( ( methods, method ) => {

    methods[ method ] = promisify( store[ method ].bind( store ) );

    return methods;

  }, {} );


  [ 'find', 'findOne', 'count' ].reduce( ( methods, method ) => {

    const fn = ( { query = {}, skip, limit, sort } = {}, cb ) => {

      const querier = store[ method ]( query );

      if ( skip ) querier.skip( skip );
      if ( limit ) querier.limit( limit );
      if ( sort ) querier.sort( sort );

      return querier.exec( cb );
    }

    methods[ method ] = promisify( fn.bind( store ) );

    return methods;

  }, promisifiedStore );

  promisifiedStore.update = ( query, update, options ) => {
    return new Promise( ( resolve, reject ) => {
      store.update( query, update, options, ( err, ...res ) => {
        if ( err ) return reject( err );
        resolve( res );
      } );
    } );
  };

  return promisifiedStore;
};
