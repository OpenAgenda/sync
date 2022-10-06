'use strict';

const VError = require('@openagenda/verror');
const _ = require('lodash');
const upStats = require('./lib/upStats');
const potentialOaError = require('./utils/potentialOaError');
const getAgenda = require('./lib/getAgenda');

module.exports = async function deleteEvent(context, {
  list,
  index,
}) {
  const {
    oa,
    syncDb,
    publicKey,
    simulate,
    log,
    stats,
    agendaMap,
    catchError,
  } = context;
  const { startSyncDate } = stats;

  const eventToRemove = list[index];
  const { agendaUid } = eventToRemove;

  const agendaStats = stats.agendas[agendaUid];

  try {
    if (!agendaMap[agendaUid]) {
      agendaMap[agendaUid] = {
        agenda: await getAgenda(agendaUid, publicKey)
          .catch(err => {
            throw new VError(err, `Can\'t get agenda ${agendaUid}`);
          }),
      };
    }

    if (!simulate) {
      await potentialOaError(oa.events.delete(eventToRemove.data.agendaUid, eventToRemove.data.uid)
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

    upStats(agendaStats, 'removedEvents');
  } catch (e) {
    const error = new VError({
      cause: e,
      info: {
        oaEventUid: eventToRemove.data.uid,
        eventToRemove
      }
    }, 'Error on event remove');

    upStats(agendaStats, 'eventRemoveErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${eventToRemove.data.uid}.json`);
  }
};
