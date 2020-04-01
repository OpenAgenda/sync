const axios = require('axios');
const OaError = require('./errors/OaError');

module.exports = async function listOaLocations(agendaUid, log) {
  let result = [];

  let locations;
  let offset = 0;
  const limit = 20;

  while (({ items: locations } = await listLocations(agendaUid, offset, limit)) && locations && locations.length) {
    result = [...result, ...locations];
    offset += locations.length;
    log.info(`List ${locations.length} OA locations ! (Total: ${offset})`);
  }

  return result;
};

async function listLocations(agendaUid, offset, limit) {
  const { data } = await axios.get(`https://openagenda.com/agendas/${agendaUid}/locations.json?offset=${offset}&limit=${limit}`)
    .catch(error => {
      throw new OaError(error)
    });

  return data;
}
