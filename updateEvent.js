'use strict';

const _ = require('lodash');
const moment = require('moment');
const VError = require('@openagenda/verror');
const removeFalsyEvent = require('./removeFalsyEvent');
const recreateEvent = require('./recreateEvent');
const updateOaEvent = require('./lib/updateOaEvent');
const createOaEvent = require('./lib/createOaEvent');
const upStats = require('./lib/upStats');
const castTimings = require('./utils/castTimings');
const potentialOaError = require('./utils/potentialOaError');
const UPDATE_METHOD = require('./updateMethod');

module.exports = async function updateEvent(context, {
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
    forceUpdateOption,
    simulate,
    log,
    stats,
    catchError,
    ignoredDeletes,
  } = context;
  const { startSyncDate } = stats;

  const agendaStats = stats.agendas[agendaUid];
  const itemToUpdate = list[index];
  const chunkedTimings = _.chunk(itemToUpdate.data.timings, 800);
  const syncEvents = await syncDb.events.find({
    query: {
      agendaUid: agendaUid,
      correspondenceId: itemToUpdate.correspondenceId
    }
  });

  const newestEventUpdatedDate = itemToUpdate.rawEvents.reduce((result, value) => {
    const eventUpdatedDate = methods.event.getUpdatedDate(value);
    return moment(eventUpdatedDate).isAfter(moment(result)) ? eventUpdatedDate : result;
  }, methods.event.getUpdatedDate(itemToUpdate.rawEvents[0]));
  const olderSyncedAt = syncEvents.reduce(
    (result, value) => moment(value.syncedAt).isBefore(moment(result)) ? value.syncedAt : result,
    syncEvents[0].syncedAt
  );
  const sameTimings = _.isEqual(
    _.orderBy(_.flatten(syncEvents.map(v => v.data.timings)), ['begin', 'end']),
    _.orderBy(castTimings(itemToUpdate.data.timings), ['begin', 'end'])
  );

  const needUpdate = forceUpdateOption || moment(newestEventUpdatedDate).isAfter(olderSyncedAt);

  if (chunkedTimings.length > 1) {
    upStats(agendaStats, 'splitSourceEvents');
    upStats(agendaStats, 'splittedSourceEvents', chunkedTimings.length);
  }

  if (!needUpdate && sameTimings) {
    log(
      'info',
      `UPDATE EVENT ${index + 1}/${list.length} (No need to update: continue)`,
      {
        agendaUid,
        eventId: itemToUpdate.eventId,
        locationId: itemToUpdate.locationId
      }
    );

    if (!simulate) {
      await syncDb.events.update(
        { agendaUid, correspondenceId: itemToUpdate.correspondenceId },
        { $set: { syncedAt: new Date() } },
        {}
      );
    }

    upStats(agendaStats, 'upToDateEvents');

    return;
  }

  for (let i = 0; i < chunkedTimings.length; i++) {
    const timings = chunkedTimings[i];
    const syncEvent = syncEvents[i];

    if (syncEvent) {
      // update
      let event = {
        ...itemToUpdate.data,
        slug: syncEvent.data.slug,
        timings
      };

      try {
        const postMapContext = methods.event.postMap.createContext({ ...context, agendaUid });
        ({ result: event } = await methods.event.postMap(
          event,
          formSchema,
          {
            isUpdate: true,
            isCreate: false,
          }, postMapContext,
        ));

        const method = event[UPDATE_METHOD] || 'update';

        if (!event) {
          await removeFalsyEvent(context, {
            agendaUid,
            list,
            index,
            syncEvent,
            event,
          });

          continue;
        }

        log(
          'info',
          `UPDATE EVENT ${index + 1}/${list.length}`,
          {
            agendaUid,
            method,
            eventId: itemToUpdate.eventId,
            locationId: itemToUpdate.locationId
          }
        );
        // console.log( JSON.stringify( _.orderBy( _.flatten( syncEvents.map( v => v.data.timings ) ), [ 'begin', 'end' ] ) ) );
        // console.log( JSON.stringify( _.orderBy( castTimings( itemToUpdate.data.timings ), [ 'begin', 'end' ] ) ) );
        // console.log( 'sameTimings', sameTimings );
        // console.log(
        //   _.differenceWith(
        //     _.orderBy( _.flatten( syncEvents.map( v => v.data.timings ) ), [ 'begin', 'end' ] ),
        //     _.orderBy( castTimings( itemToUpdate.data.timings ), [ 'begin', 'end' ] ),
        //     _.isEqual
        //   )
        // );

        if (!simulate) {
          const updatedEvent = await updateOaEvent(
            syncEvent.data.uid,
            event,
            method,
            {
              oa,
              agendaUid,
              noBailOnInvalidImage,
              defaultImageUrl,
              stats
            }
          );

          await syncDb.events.update({ _id: syncEvent._id }, {
            $set: {
              syncedAt: new Date(),
              data: updatedEvent
            }
          }, {});
        }

        upStats(agendaStats, 'updatedEvents');
      } catch (e) {
        if (_.get(e, 'response.data.error') === 'event not found') {
          await recreateEvent(context, {
            agendaUid,
            itemToUpdate,
            syncEvent,
            event,
          });
        } else {
          ignoredDeletes.push(syncEvent.data.uid);

          const error = new VError({
            cause: e,
            info: {
              correspondenceId: itemToUpdate.correspondenceId,
              syncEvent,
              itemToUpdate
            }
          }, 'Error on event update');

          upStats(agendaStats, 'eventUpdateErrors', error);
          catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
        }
      }
    } else {
      // create
      let event = {
        ...itemToUpdate.data,
        timings
      };

      try {
        const postMapContext = methods.event.postMap.createContext({ ...context, agendaUid });
        ({ result: event } = await methods.event.postMap(
          event,
          formSchema,
          {
            isUpdate: true,
            isCreate: false,
          }, postMapContext,
        ));

        const method = event[UPDATE_METHOD] || 'update';

        if (!event) {
          upStats(agendaStats, 'ignoredEvents');

          continue;
        }

        if (method === 'patch') {
          event = {
            ...itemToUpdate.data,
            timings,
            ...event
          };
        }

        log(
          'info',
          `UPDATE EVENT ${index + 1}/${list.length} (one more for new timings)`,
          {
            agendaUid,
            eventId: itemToUpdate.eventId,
            locationId: itemToUpdate.locationId,
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
            correspondenceId: itemToUpdate.correspondenceId,
            syncedAt: new Date(),
            data: createdEvent
          });
        }

        upStats(agendaStats, 'createdEvents');
      } catch (e) {
        const error = new VError({
          cause: e,
          info: {
            correspondenceId: itemToUpdate.correspondenceId,
            syncEvent,
            itemToUpdate
          }
        }, 'Error on event update (one more for new timings)');

        upStats(agendaStats, 'eventCreateTimingsErrors', error);
        catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
      }
    }
  }

  for (let i = chunkedTimings.length; i < syncEvents.length; i++) {
    const syncEvent = syncEvents[i];

    try {
      if (!simulate) {
        await potentialOaError(oa.events.delete(agendaUid, syncEvent.data.uid)
          .catch(e => {
            // already removed on OA
            if (e?.response?.status !== 404) {
              throw e;
            }
          }));
      }

      log(
        'info',
        'Event with timings that exceed deleted',
        {
          agendaUid,
          eventId: itemToUpdate.eventId,
          locationId: itemToUpdate.locationId
        }
      );
    } catch (e) {
      const error = new VError({
        cause: e,
        info: {
          correspondenceId: itemToUpdate.correspondenceId,
          syncEvent,
          itemToUpdate
        }
      }, 'Error on event update (one less for removed timings)');

      upStats(agendaStats, 'eventRemoveTimingsErrors', error);
      catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
    }
  }
};
