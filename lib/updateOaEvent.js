'use strict';

const _ = require('lodash');
const upStats = require('./upStats');
const OaError = require('../errors/OaError');
const SourceError = require('../errors/SourceError');

module.exports = async function updateEvent(
  oaEventUid,
  mappedEvent,
  updateMethod,
  {
    oa,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    stats
  }
) {
  const agendaStats = stats.agendas[agendaUid];

  const method = updateMethod === 'patch' || updateMethod === 'update'
    ? updateMethod
    : 'update';

  return oa.events[method](agendaUid, oaEventUid, mappedEvent)
    .catch(e => {
      if (
        noBailOnInvalidImage
        && e?.response?.data?.errors?.length === 1
        && e.response.data.errors[0].field === 'image'
      ) {
        upStats(agendaStats, 'invalidImages');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
        return oa.events[method](agendaUid, oaEventUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (e.response.status === 400) {
        throw new SourceError({ cause: e, info: { errors: e.response.data.errors } }, 'Invalid data');
      }

      throw new OaError(e);
    });
};
