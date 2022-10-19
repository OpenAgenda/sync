'use strict';

const potentialOaError = require('./utils/potentialOaError');
const _ = require('lodash');
const upStats = require('./lib/upStats');
const VError = require('@openagenda/verror');

module.exports = async function removeFalsyEvent(context, {
  agendaUid,
  list,
  index,
  syncEvent,
  event,
}) {
  const {
    oa,
    syncDb,
    simulate,
    log,
    stats,
    catchError,
  } = context;
  const { startSyncDate } = stats;

  const agendaStats = stats.agendas[agendaUid];
  const itemToUpdate = list[index];

  try {
    log(
      'info',
      `REMOVE falsy event ${index + 1}/${list.length}`,
      {
        agendaUid,
        eventId: itemToUpdate.eventId,
        locationId: itemToUpdate.locationId,
      },
    );

    if (!simulate) {
      await potentialOaError(oa.events.delete(agendaUid, syncEvent.data.uid)
        .catch(e => {
          // already removed on OA
          if (e?.response?.status !== 404) {
            throw e;
          }
        }));

      await syncDb.events.remove({ _id: syncEvent._id }, {});

      upStats(agendaStats, 'removedFalsyEvents');
    }
  } catch (e) {
    const error = new VError({
      cause: e,
      info: {
        correspondenceId: itemToUpdate.correspondenceId,
        event,
        itemToUpdate,
      },
    }, 'Error on event remove (after event.postMap)');

    upStats(agendaStats, 'eventFalsyRemoveErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
  }
};
