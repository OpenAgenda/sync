'use strict';

const VError = require('@openagenda/verror');
const _ = require('lodash');
const upStats = require('./lib/upStats');
const potentialOaError = require('./utils/potentialOaError');

module.exports = async function deleteEvent(params, {
  list,
  index,
  catchError,
  startSyncDate,
}) {
  const {
    oa,
    syncDb,
    agendaUid,
    simulate,
    log,
    stats,
  } = params;

  const eventToRemove = list[index];

  try {
    if (!simulate) {
      await potentialOaError(oa.events.delete(agendaUid, eventToRemove.data.uid)
        .catch(e => {
          if ( // already removed on OA
            !_.isMatch(e?.response, {
              status: 404,
              data: {
                error: 'event not found'
              }
            })
          ) {
            throw e;
          }
        }));

      await syncDb.events.remove({ _id: eventToRemove._id }, {});
    }

    log('info', 'REMOVE EVENT', { oaEventUid: eventToRemove.data.uid });

    upStats(stats, 'removedEvents');
  } catch (e) {
    const error = new VError({
      cause: e,
      message: 'Error on event remove',
      info: {
        oaEventUid: eventToRemove.data.uid,
        eventToRemove
      }
    });

    upStats(stats, 'eventRemoveErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${eventToRemove.data.uid}.json`);
  }
};
