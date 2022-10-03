'use strict';

const potentialOaError = require('./utils/potentialOaError');
const _ = require('lodash');
const upStats = require('./lib/upStats');
const VError = require('@openagenda/verror');
module.exports = async function removeFalsyEvent(params, {
  list,
  index,
  syncEvent,
  event,
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

  const itemToUpdate = list[index];

  try {
    log(
      'info',
      `REMOVE falsy event ${index + 1}/${list.length}`,
      {
        eventId: itemToUpdate.eventId,
        locationId: itemToUpdate.locationId,
      },
    );

    if (!simulate) {
      await potentialOaError(oa.events.delete(agendaUid, syncEvent.data.uid)
        .catch(e => {
          if ( // already removed on OA
            !_.isMatch(e?.response, {
              status: 404,
              data: {
                error: 'event not found',
              },
            })
          ) {
            throw e;
          }
        }));

      await syncDb.events.remove({ _id: syncEvent._id }, {});

      upStats(stats, 'removedFalsyEvents');
    }
  } catch (e) {
    const error = new VError({
      cause: e,
      message: 'Error on event remove (after event.postMap)',
      info: {
        correspondenceId: itemToUpdate.correspondenceId,
        event,
        itemToUpdate,
      },
    });

    upStats(stats, 'eventFalsyRemoveErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
  }
};
