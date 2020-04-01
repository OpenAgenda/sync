'use strict';

const _ = require('lodash');
const upStats = require('./upStats');

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
  let updatedEvent;

  try {
    ({ event: updatedEvent } = await oa.events.update(agendaUid, oaEventUid, mappedEvent));
  } catch (e) {
    if (noBailOnInvalidImage && _.get(e, 'response.body.errors[0].step') === 'image') {
      upStats(stats, 'invalidImages');
      mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      ({ event: updatedEvent } = await oa.events.update(agendaUid, oaEventUid, mappedEvent));
    } else {
      throw e;
    }
  }

  return updatedEvent;
};
