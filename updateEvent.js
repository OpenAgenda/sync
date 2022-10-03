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

module.exports = async function updateEvent(params, {
  agendaUid,
  formSchema,
  list,
  index,
  catchError,
  startSyncDate,
  ignoredDeletes,
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
  } = params;

  const itemToUpdate = list[index];
  const chunkedTimings = _.chunk(itemToUpdate.data.timings, 800);
  const syncEvents = await syncDb.events.find({ query: {
    agendaUid: agendaUid,
    correspondenceId: itemToUpdate.correspondenceId
  } });

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
    upStats(stats, 'splitSourceEvents');
    upStats(stats, 'splittedSourceEvents', chunkedTimings.length);
  }

  if (!needUpdate && sameTimings) {
    log(
      'info',
      `UPDATE EVENT ${index + 1}/${list.length} (No need to update: continue)`,
      {
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

    upStats(stats, 'upToDateEvents');

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
        event = await methods.event.postMap(event, formSchema);

        if (!event) {
          await removeFalsyEvent(params, {
            list: list,
            index,
            syncEvent,
            event,
            catchError,
            startSyncDate,
          });

          continue;
        }

        log(
          'info',
          `UPDATE EVENT ${index + 1}/${list.length}`,
          {
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

        upStats(stats, 'updatedEvents');
      } catch (e) {
        if (_.get(e, 'response.data.error') === 'event not found') {
          await recreateEvent(params, {
            itemToUpdate,
            syncEvent,
            event,
            catchError,
            startSyncDate,
          });
        } else {
          ignoredDeletes.push(syncEvent.data.uid);

          const error = new VError({
            cause: e,
            message: 'Error on event update',
            info: {
              correspondenceId: itemToUpdate.correspondenceId,
              syncEvent,
              itemToUpdate
            }
          });

          upStats(stats, 'eventUpdateErrors', error);
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

        event = await methods.event.postMap(event, formSchema);

        if (!event) {
          upStats(stats, 'ignoredEvents');

          continue;
        }

        log(
          'info',
          `UPDATE EVENT ${index + 1}/${list.length} (one more for new timings)`,
          {
            eventId: itemToUpdate.eventId,
            locationId: itemToUpdate.locationId
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

        upStats(stats, 'createdEvents');
      } catch (e) {
        const error = new VError({
          cause: e,
          message: 'Error on event update (one more for new timings)',
          info: {
            correspondenceId: itemToUpdate.correspondenceId,
            syncEvent,
            itemToUpdate
          }
        });

        upStats(stats, 'eventCreateTimingsErrors', error);
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
      }

      log(
        'info',
        'Event with timings that exceed deleted',
        {
          eventId: itemToUpdate.eventId,
          locationId: itemToUpdate.locationId
        }
      );
    } catch (e) {
      const error = new VError({
        cause: e,
        message: 'Error on event update (one less for removed timings)',
        info: {
          correspondenceId: itemToUpdate.correspondenceId,
          syncEvent,
          itemToUpdate
        }
      });

      upStats(stats, 'eventRemoveTimingsErrors', error);
      catchError(error, `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`);
    }
  }
};
