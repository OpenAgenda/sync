const OaError = require('../errors/OaError');

module.exports = async function listOaLocations(oa, agendaUid, log) {
  let result = [];

  let locations;
  let offset = 0;
  const limit = 20;

  while ((locations = await listLocations(oa, agendaUid, offset, limit)) && locations?.length) {
    result = [...result, ...locations];
    offset += locations.length;
    log.info(`List ${locations.length} OA locations ! (Total: ${offset})`);
  }

  return result;
};

async function listLocations(oa, agendaUid, offset, limit) {
  const { locations } = await oa.locations.list(agendaUid, { from: offset, size: limit, detailed: true })
    .catch(error => {
      throw new OaError(error);
    });

  return locations;
}
