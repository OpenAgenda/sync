'use strict';

const VError = require('@openagenda/verror');
const createOaEvent = require('./lib/createOaEvent');
const upStats = require('./lib/upStats');

module.exports = async function recreateEvent(context, {
  agendaUid,
  itemToUpdate,
  syncEvent,
  event,
}) {
  const {
    oa,
    syncDb,
    noBailOnInvalidImage,
    defaultImageUrl,
    simulate,
    stats,
    catchError,
  } = context;
  const { startSyncDate } = stats;

  const agendaStats = stats.agendas[agendaUid];

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
        agendaUid,
        correspondenceId: itemToUpdate.correspondenceId,
        syncedAt: new Date(),
        data: createdEvent,
      });
    }

    upStats(agendaStats, 'recreatedEvents');
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

    upStats(agendaStats, 'eventRecreateErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
  }
};
