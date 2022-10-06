'use strict';

const _ = require('lodash');
const VError = require('@openagenda/verror');
const upStats = require('./lib/upStats');
const createOaEvent = require('./lib/createOaEvent');

module.exports = async function createEvent(context, {
  agendaUid,
  formSchema,
  list,
  index,
}) {
  const {
    methods,
    oa,
    syncDb,
    noBailOnInvalidImage,
    defaultImageUrl,
    simulate,
    log,
    stats,
    catchError,
  } = context;
  const { startSyncDate } = stats;

  const agendaStats = stats.agendas[agendaUid];
  const itemToCreate = list[index];
  const chunkedTimings = _.chunk(itemToCreate.data.timings, 800);

  if (chunkedTimings.length > 1) {
    upStats(agendaStats, 'splitSourceEvents');
    upStats(agendaStats, 'splittedSourceEvents', chunkedTimings.length);
  }

  for (let i = 0; i < chunkedTimings.length; i++) {
    const timings = chunkedTimings[i];
    let event = { ...itemToCreate.data, timings };

    try {
      const postMapContext = methods.event.postMap.createContext({ ...context, agendaUid });
      ({ result: event } = await methods.event.postMap(event, formSchema, postMapContext));

      if (!event) {
        upStats(agendaStats, 'ignoredEvents');
        continue;
      }

      log(
        'info',
        `CREATE EVENT ${index + 1}/${list.length}`,
        {
          agendaUid,
          eventId: itemToCreate.eventId,
          locationId: itemToCreate.locationId
        }
      );

      if (!simulate) {
        const createdEvent = await createOaEvent(
          event,
          {
            oa,
            agendaUid,
            noBailOnInvalidImage,
            defaultImageUrl,
            stats
          }
        );

        await syncDb.events.insert({
          agendaUid,
          correspondenceId: itemToCreate.correspondenceId,
          syncedAt: new Date(),
          data: createdEvent
        });
      }

      upStats(agendaStats, 'createdEvents');
    } catch (e) {
      const error = new VError({
        cause: e,
        info: {
          correspondenceId: itemToCreate.correspondenceId,
          event,
          itemToCreate
        }
      }, 'Error on event create');

      upStats(agendaStats, 'eventCreateErrors', error);
      catchError(error, `${startSyncDate.toISOString()}:${itemToCreate.correspondenceId}:${i}.json`);
    }
  }
};
