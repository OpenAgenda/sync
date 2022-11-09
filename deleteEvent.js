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
    methods,
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
  const { agendaUid } = eventToRemove.data;

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

    const shouldRemove = await methods.event.shouldRemove(eventToRemove);

    if (!shouldRemove) {
      log('info', 'SKIP REMOVE', { oaEventUid: eventToRemove.data.uid });
      return;
    }

    if (!simulate) {
      await potentialOaError(oa.events.delete(agendaUid, eventToRemove.data.uid)
        .catch(e => {
          // already removed on OA
          if (e?.response?.status !== 404) {
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
        agendaUid: eventToRemove.data.agendaUid,
        oaEventUid: eventToRemove.data.uid,
        eventToRemove
      }
    }, 'Error on event remove');

    upStats(agendaStats, 'eventRemoveErrors', error);
    catchError(error, `${startSyncDate.toISOString()}:${eventToRemove.data.uid}.json`);
  }
};
