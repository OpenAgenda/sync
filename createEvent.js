'use strict';

const _ = require('lodash');
const upStats = require('./upStats');
const OaError = require('./errors/OaError');

module.exports = async function createEvent(
  mappedEvent,
  {
    oa,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    stats
  }
) {
  let createdEvent;

  try {
    try {
      ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
    } catch (e) {
      // Retry if it's a duplicate slug error
      if (_.isMatch(_.get(e, 'response.body.errors[0]', null), {
        field: 'slug',
        code: 'duplicate'
      })) {
        mappedEvent.slug += '_' + _.random(Math.pow(10, 6));
        ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
      } else {
        throw e;
      }
    }
  } catch (e2) {
    if (noBailOnInvalidImage && _.get(e2, 'response.body.errors[0].step') === 'image') {
      upStats(stats, 'invalidImages');
      mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
    } else {
      throw new OaError(e2);
    }
  }

  return createdEvent;
};
