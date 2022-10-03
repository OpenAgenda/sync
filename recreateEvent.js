'use strict';

const VError = require('@openagenda/verror');
const createOaEvent = require('./lib/createOaEvent');
const upStats = require('./lib/upStats');

module.exports = async function recreateEvent(params, {
  itemToUpdate,
  syncEvent,
  event,
  catchError,
  startSyncDate,
}) {
  const {
    oa,
    syncDb,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    simulate,
    stats,
  } = params;

  try {
    if (!simulate) {
      // Remove event from nedb and recreate
      await syncDb.events.remove({ _id: syncEvent._id }, {});

      const createdEvent = await createOaEvent(
        event,
        {
          oa,
          agendaUid,
          noBailOnInvalidImage,
          defaultImageUrl,
          stats,
        },
      );

      await syncDb.events.insert({
        correspondenceId: itemToUpdate.correspondenceId,
        syncedAt: new Date(),
        data: createdEvent,
      });
    }

    upStats(stats, 'recreatedEvents');
  } catch (e) {
    const error = new VError({
      cause: e,
      message: 'Error on event recreate',
      info: {
        correspondenceId: itemToUpdate.correspondenceId,
        syncEvent,
        itemToUpdate,
      },
    });

    upStats(stats, 'eventRecreateErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
  }
};
