'use strict';

const _ = require('lodash');
const upStats = require('./upStats');
const OaError = require('./errors/OaError');
const SourceError = require('./errors/SourceError');

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
  return oa.events.create(agendaUid, mappedEvent)
    .catch(e => {
      // Retry if it's a duplicate slug error
      if (_.isMatch(_.get(e, 'response.body.errors[0]', null), {
        field: 'slug',
        code: 'duplicate'
      })) {
        return oa.events.create(agendaUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (noBailOnInvalidImage && _.get(e, 'response.body.errors[0].step') === 'image') {
        upStats(stats, 'invalidImages');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
        return oa.events.create(agendaUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (e.status === 400 && e.response?.body?.message === 'data is invalid') {
        throw new SourceError({ cause: e, info: { errors: e.response.body.errors } }, 'Invalid data');
      }

      throw new OaError(e);
    })
    .then(result => result.event);
};
