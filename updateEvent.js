'use strict';

const _ = require('lodash');
const upStats = require('./upStats');
const OaError = require('./errors/OaError');
const SourceError = require('./errors/SourceError');

module.exports = async function updateEvent(
  oaEventUid,
  mappedEvent,
  {
    oa,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    stats
  }
) {
  return oa.events.update(agendaUid, oaEventUid, mappedEvent)
    .catch(e => {
      if (noBailOnInvalidImage && _.get(e, 'response.body.errors[0].step') === 'image') {
        upStats(stats, 'invalidImages');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
        return oa.events.update(agendaUid, oaEventUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (e.status === 400 && e.response?.body?.message === 'data is invalid') {
        throw new SourceError(e, 'Invalid data');
      }

      throw new OaError(e);
    })
    .then(result => result.event);
};
