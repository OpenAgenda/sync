const axios = require( 'axios' );

module.exports = async function listOaLocations( agendaUid ) {
  let result = [];

  let locations;
  let offset = 0;
  const limit = 20;

  while ( ({ items: locations } = await listLocations( agendaUid, offset, limit )) && locations && locations.length ) {
    result = [ ...result, ...locations ];
    offset += limit;
  }

  return result;
};

async function listLocations( agendaUid, offset, limit ) {
  const { data } = await axios.get( `https://openagenda.com/agendas/${agendaUid}/locations.json?offset=${offset}&limit=${limit}` );

  return data;
}
