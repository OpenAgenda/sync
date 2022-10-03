'use strict';

const _ = require('lodash');
const VError = require('@openagenda/verror');
const upStats = require('./lib/upStats');
const createOaEvent = require('./lib/createOaEvent');

module.exports = async function createEvent(params, {
  agendaUid,
  formSchema,
  list,
  index,
  catchError,
  startSyncDate,
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
  } = params;

  const itemToCreate = list[index];
  const chunkedTimings = _.chunk(itemToCreate.data.timings, 800);

  if (chunkedTimings.length > 1) {
    upStats(stats, 'splitSourceEvents');
    upStats(stats, 'splittedSourceEvents', chunkedTimings.length);
  }

  for (let i = 0; i < chunkedTimings.length; i++) {
    const timings = chunkedTimings[i];
    let event = { ...itemToCreate.data, timings };

    try {
      event = await methods.event.postMap(event, formSchema);

      if (!event) {
        upStats(stats, 'ignoredEvents');

        continue;
      }

      log(
        'info',
        `CREATE EVENT ${index + 1}/${list.length}`,
        {
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
          agendaUid: agendaUid,
          correspondenceId: itemToCreate.correspondenceId,
          syncedAt: new Date(),
          data: createdEvent
        });
      }

      upStats(stats, 'createdEvents');
    } catch (e) {
      const error = new VError({
        cause: e,
        message: 'Error on event create',
        info: {
          correspondenceId: itemToCreate.correspondenceId,
          event,
          itemToCreate
        }
      });

      upStats(stats, 'eventCreateErrors', error);
      catchError(error, `${startSyncDate.toISOString()}:${itemToCreate.correspondenceId}:${i}.json`);
    }
  }
};
