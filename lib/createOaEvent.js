'use strict';

const _ = require('lodash');
const upStats = require('./upStats');
const OaError = require('../errors/OaError');
const SourceError = require('../errors/SourceError');

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
  const agendaStats = stats.agendas[agendaUid];

  return oa.events.create(agendaUid, mappedEvent)
    .catch(e => {
      // Retry if it's a duplicate slug error
      if (_.isMatch(_.get(e, 'response.data.errors[0]', null), {
        field: 'slug',
        code: 'duplicate'
      })) {
        return oa.events.create(agendaUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (
        noBailOnInvalidImage
        && e?.response?.data?.errors?.length === 1
        && e.response.data.errors[0].field === 'image'
      ) {
        upStats(agendaStats, 'invalidImages');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
        return oa.events.create(agendaUid, mappedEvent);
      }

      throw e;
    })
    .catch(e => {
      if (e.status === 400 && e.response?.data?.message === 'data is invalid') {
        throw new SourceError({ cause: e, info: { errors: e.response.data.errors } }, 'Invalid data');
      }

      throw new OaError(e);
    });
};
