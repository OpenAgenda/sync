'use strict';

const axios = require('axios');
const { readdirSync, writeFileSync, readFileSync, unlinkSync } = require('fs');
const { inspect } = require('util');
const path = require('path');
const _ = require('lodash');
const Nedb = require('nedb');
const moment = require('moment');
const VError = require('verror');
const mkdirp = require('mkdirp');
const OaSdk = require('@openagenda/sdk-js/dist/index');
const { hooks, withParams } = require('@feathersjs/hooks');
const promisifyStore = require('./utils/promisifyStore');
const isURL200 = require('./utils/isURL200');
const statsUtil = require('./stats');
const upStats = require('./utils/upStats');
const createEvent = require('./createEvent');
const updateEvent = require('./updateEvent');
// Oa
const getFormSchema = require('./getFormSchema');
const listOaLocations = require('./listOaLocations');
const listSavedEvents = require('./listSavedEvents');

function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
}

function throwMissingTimings() {
  return async (context, next) => {
    await next();

    const { result } = context;

    const timings = result && result.timings && result.timings.length
      ? result.timings.filter(Boolean)
      : [];

    if (!timings.length) {
      throw new Error('Missing timings');
    }
  };
}


// Defauts
const defaultGetLocation = (locationId, eventLocation) => eventLocation;
const defaultGetEventUpdatedDate = () => new Date();

/*
* créer une méthode `event.list(query, offset, limit)`
* créer une méthode `event.map(event, formSchema, oaLocations)`           (transform from foreign event to oa event)
*   - chaque event doit contenir un tableau `locations`                   (useful for location.{get/map})
* paramétrer une interface `event.getId(event)`                           (for create correpondenceId)
* paramétrer une interface `event.getUpdatedDate(event)`                  (for keep the update date up-to-date)
* paramétrer une interface `location.getId(location, event)`              (for getLocation and create correpondenceId)
* paramétrer une interface `location.find(oaLocations, location)`         (for search in oa locations)
* créer une méthode `location.get(locationId, eventLocation)`             (get a foreign location)
* créer une méthode `location.map(location, eventLocation)`               (transform from foreign location to oa location)
* */

module.exports = async function syncTask(options) {
  const {
    directory,
    log,
    downloadOnly,
    simulate
  } = options;

  /*
  * event: {
  *   list,
  *   map,
  *   getId,
  *   getUpdatedDate,
  *   postMap
  * },
  * location: {
  *   get,
  *   map,
  *   getId,
  *   find
  * }
  * */
  const methods = _.merge({
    location: {
      get: defaultGetLocation
    },
    event: {
      getEventUpdatedDate: defaultGetEventUpdatedDate
    }
  }, options.methods);

  const stats = {};

  mkdirp.sync(path.join(directory, 'data'));
  mkdirp.sync(path.join(directory, 'errors'));
  mkdirp.sync(path.join(directory, 'db'));

  try {
    if (simulate) {
      await synchronize({ ...options, stats, methods });

      return stats;
    }

    // Before all we finish the last synchronisation
    if (!downloadOnly && readdirSync(path.join(directory, 'data')).length) {
      await synchronize({ ...options, stats, methods, skipDeletion: true });
    }

    const limit = 20;
    let events;
    let offset = 0;

    log('info', 'Start saving');

    try {
      while ((events = await methods.event.list({}, offset, limit)) && events.length) {
        for (let i = 0; i < events.length; i++) {
          const event = events[i];

          writeFileSync(
            path.join(directory, 'data', `event.${offset + i}.json`),
            JSON.stringify(event, null, 2)
          );
        }
        log('info', `${events.length} saved events ! (Total: ${offset + events.length})`);
        upStats(stats, 'savedEvents', events.length);
        offset += events.length;
      }
    } catch (e) {
      if (e && (!e.response || e.response.status !== 416)) { // OutOfRange
        log('error', `Cannot list events: ${inspect(e)}`);

        stats.startSyncDateStr = moment().locale('fr').format('dddd D MMMM YYYY à HH:mm');
        stats.eventListError = { message: e.message, status: e.response && e.response.status };

        reduceStats(stats);
        await pushStats(options, stats);
        await statsUtil.sendReport(options);

        return stats;
      }
    }

    if (downloadOnly) {
      return stats;
    }

    await synchronize({ ...options, stats, methods });

  } catch (e) {
    // script error
    log('error', e.response || e);
  }

  reduceStats(stats);
  await pushStats(options, stats);
  await statsUtil.sendReport(options);

  return stats;
};

async function synchronize(options) {
  const {
    methods,
    directory,
    skipDeletion,
    forceUpdate: forceUpdateOption,
    noBailOnInvalidImage,
    defaultImageUrl,
    log,
    stats,
    publicKey,
    secretKey,
    simulate
  } = options;
  const agendaUid = options.agendaUid || options.agenda.uid;

  const syncDb = {
    events: promisifyStore(new Nedb({
      filename: path.join(directory, 'db', 'events.nedb'),
      timestampData: true,
      autoload: true
    })),
    locations: promisifyStore(new Nedb({
      filename: path.join(directory, 'db', 'locations.nedb'),
      timestampData: true,
      autoload: true
    }))
  };

  const mapEvent = hooks(methods.event.map, {
    context: withParams('event', 'formSchema', 'oaLocations'),
    middleware: [throwMissingTimings()]
  });
  const postMapEvent = typeof methods.event.postMap === 'function'
    ? hooks(methods.event.postMap, {
      context: withParams('event', 'formSchema'),
      middleware: [throwMissingTimings()]
    }) : null;

  const startSyncDate = new Date();
  log('info', `startSyncDate: ${startSyncDate.toJSON()}`);
  stats.startSyncDate = startSyncDate;
  stats.startSyncDateStr = moment(startSyncDate).locale('fr').format('dddd D MMMM YYYY à HH:mm');

  const oa = new OaSdk({ secretKey });
  await oa.connect();

  const oaLocations = await listOaLocations(agendaUid, log);
  const formSchema = await getFormSchema({ agendaUid, publicKey });

  const changes = {
    create: [],
    update: []
  };
  const ignoredDeletes = [];

  /* PHASE 1: compare to existent events */
  const filenames = listSavedEvents(directory);

  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];

    log.info(`Dispatch ${filename} (${i + 1}/${filenames.length})`);

    const event = JSON.parse(readFileSync(path.join(directory, 'data', filename), 'utf8'));
    let eventId;

    try {
      eventId = methods.event.getId(event);
      const mappedEvent = await mapEvent(event, formSchema, oaLocations);

      if (!mappedEvent) {
        upStats(stats, 'ignoredEvents');

        continue;
      }

      if (
        noBailOnInvalidImage
        && mappedEvent.image && !(await isURL200(mappedEvent.image.url))
      ) {
        upStats(stats, 'invalidImages');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      }

      const eventLocations = mappedEvent.locations;
      delete mappedEvent.locations;

      if (eventLocations.length === 0) {
        upStats(stats, 'eventsWithoutLocation');
      }

      if (eventLocations.length > 1) {
        upStats(stats, 'splitSourceLocations');
        upStats(stats, 'splitedSourceLocations', eventLocations.length);
      }

      for (const eventLocation of eventLocations) {
        let syncEvent = null;
        let location = null;
        let locationId;

        try {
          locationId = methods.location.getId(eventLocation, event);
          const foundOaLocation = methods.location.find(oaLocations, eventLocation);
          let foundLocation = (await syncDb.locations.findOne({ query: { correspondenceId: locationId } }));

          // This is commented because the oaLocations is not up to date (mySQL <-> ES)
          // if (
          //   foundLocation && !foundOaLocation
          //   && !oaLocations.find( oaLocation => oaLocation.uid === foundLocation.data.uid )
          // ) {
          //   await syncDb.locations.remove( { _id: foundLocation._id }, {} );
          //   foundLocation = null;
          // }

          if (!foundLocation) {
            if (!foundOaLocation) {
              const mappedLocation = await methods.location.map(
                await methods.location.get(locationId, eventLocation),
                eventLocation
              );
              location = mappedLocation;

              if (!simulate) {
                location = await oa.locations.create(agendaUid, mappedLocation);

                await syncDb.locations.insert({
                  correspondenceId: locationId,
                  syncedAt: new Date(),
                  data: location
                });
              }

              log(
                'info',
                'LOCATION NOT FOUND => created',
                { eventId, locationId, location }
              );
              upStats(stats, 'createdLocations');
            } else {
              await syncDb.locations.insert({
                correspondenceId: locationId,
                syncedAt: new Date(),
                data: foundOaLocation
              });

              location = foundOaLocation;
            }
          } else {
            location = foundLocation.data;
          }
        } catch (e) {
          const error = new VError({
            cause: e,
            info: {
              eventId,
              eventLocation,
              mappedEvent
            }
          }, 'Error in location phase');

          upStats(stats, 'locationErrors');

          log('error', error);
          writeFileSync(
            path.join(directory, 'errors', `${startSyncDate.toISOString()}:${eventId}.${locationId}.json`),
            JSON.stringify({ error, event }, getCircularReplacer(), 2)
          );

          continue;
        }

        const data = {
          ...mappedEvent,
          locationUid: location.uid
        };

        const correspondenceId = `${eventId}.${locationId}`;

        const syncEvents = await syncDb.events.find({ query: { correspondenceId } });
        syncEvent = syncEvents[0];

        if (syncEvents.length) {
          const indexListUpdate = changes.update.findIndex(
            v => v.correspondenceId === correspondenceId
          );

          if (indexListUpdate !== -1) {
            const itemToUpdate = changes.update[indexListUpdate];

            itemToUpdate.rawEvents.push(event);

            itemToUpdate.data = {
              ...data,
              timings: _.uniqWith(
                _.concat(itemToUpdate.data.timings, data.timings)
                  .map(v => ({
                    begin: moment(v.begin).toISOString(),
                    end: moment(v.end).toISOString()
                  })),
                _.isEqual
              )
            };

            if (!stats.mergedSourceEvents) {
              stats.mergedSourceEvents = {};
            }

            stats.mergedSourceEvents[correspondenceId] = (stats.mergedSourceEvents[correspondenceId] || 1) + 1;
          } else {
            changes.update.push({
              correspondenceId,
              eventId,
              locationId,
              data,
              rawEvents: [event]
            });
          }
        } else {
          const indexListCreate = changes.create.findIndex(
            v => v.correspondenceId === correspondenceId
          );

          if (indexListCreate !== -1) {
            // merge timings and update the event(s) to update
            const itemToCreate = changes.create[indexListCreate];

            itemToCreate.rawEvents.push(event);

            itemToCreate.data = {
              ...data,
              timings: _.uniqWith(
                _.concat(itemToCreate.data.timings, data.timings)
                  .map(v => ({
                    begin: moment(v.begin).toISOString(),
                    end: moment(v.end).toISOString()
                  })),
                _.isEqual
              )
            };

            if (!stats.mergedSourceEvents) {
              stats.mergedSourceEvents = {};
            }

            stats.mergedSourceEvents[correspondenceId] = (stats.mergedSourceEvents[correspondenceId] || 1) + 1;
          } else {
            changes.create.push({
              correspondenceId,
              eventId,
              locationId,
              data,
              rawEvents: [event]
            });
          }
        }
      }
    } catch (e) {
      const error = new VError(e, 'Error in event map');

      upStats(stats, 'eventMapErrors');

      log('error', error);
      writeFileSync(
        path.join(directory, 'errors', `${startSyncDate.toISOString()}:${filename}`),
        JSON.stringify({ error, event, eventId }, getCircularReplacer(), 2)
      );
    } finally {
      unlinkSync(path.join(directory, 'data', filename));
    }
  }

  /* PHASE 2: creates */
  for (const itemToCreate of changes.create) {
    const chunkedTimings = _.chunk(itemToCreate.data.timings, 800);

    if (chunkedTimings.length > 1) {
      upStats(stats, 'splitSourceEvents');
      upStats(stats, 'splitedSourceEvents', chunkedTimings.length);
    }

    for (let i = 0; i < chunkedTimings.length; i++) {
      const timings = chunkedTimings[i];
      let event = { ...itemToCreate.data, timings };

      if (typeof postMapEvent === 'function') {
        event = await postMapEvent(event, formSchema);
      }

      if (!event) {
        upStats(stats, 'ignoredEvents');

        continue;
      }

      log(
        'info',
        'CREATE EVENT',
        {
          eventId: itemToCreate.eventId,
          locationId: itemToCreate.locationId
        }
      );

      try {
        if (!simulate) {
          const createdEvent = await createEvent(
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
            correspondenceId: itemToCreate.correspondenceId,
            syncedAt: new Date(),
            data: createdEvent
          });
        }

        upStats(stats, 'createdEvents');
      } catch (e) {
        const error = new VError({
          cause: e,
          info: itemToCreate
        }, 'Error on event create');

        upStats(stats, 'eventCreateErrors');

        log('error', error);
        writeFileSync(
          path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToCreate.correspondenceId}:${i}.json`),
          JSON.stringify({ error, itemToCreate, event }, getCircularReplacer(), 2)
        );
      }
    }
  }

  /* PHASE 3: updates */
  for (const itemToUpdate of changes.update) {
    const chunkedTimings = _.chunk(itemToUpdate.data.timings, 800);
    const syncEvents = await syncDb.events.find({ query: { correspondenceId: itemToUpdate.correspondenceId } });

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
      _.orderBy(timingsStrings(itemToUpdate.data.timings), ['begin', 'end'])
    );

    const needUpdate = forceUpdateOption || moment(newestEventUpdatedDate).isAfter(olderSyncedAt);

    if (chunkedTimings.length > 1) {
      upStats(stats, 'splitSourceEvents');
      upStats(stats, 'splitedSourceEvents', chunkedTimings.length);
    }

    if (!needUpdate && sameTimings) {
      log(
        'info',
        'UPDATE EVENT (No need to update: continue)',
        {
          eventId: itemToUpdate.eventId,
          locationId: itemToUpdate.locationId
        }
      );

      if (!simulate) {
        await syncDb.events.update(
          { correspondenceId: itemToUpdate.correspondenceId },
          { $set: { syncedAt: new Date() } },
          {}
        );
      }

      upStats(stats, 'upToDateEvents');

      continue;
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

        if (typeof postMapEvent === 'function') {
          event = await postMapEvent(event, formSchema);
        }

        if (!event) {
          try {
            log(
              'info',
              'REMOVE falsy event',
              {
                eventId: itemToUpdate.eventId,
                locationId: itemToUpdate.locationId
              }
            );

            if (!simulate) {
              await oa.events.delete(agendaUid, syncEvent.data.uid)
                .catch(e => {
                  if ( // already removed on OA
                    !_.isMatch(e && e.response && e.response, {
                      status: 404,
                      body: {
                        error: 'event not found'
                      }
                    })
                  ) {
                    throw e;
                  }
                });

              await syncDb.events.remove({ _id: syncEvent._id }, {});

              upStats(stats, 'removedFalsyEvents');
            }
          } catch (e) {
            const error = new VError(e, 'Error on event remove (after event.postMap)');

            upStats(stats, 'eventFalsyRemoveErrors');

            log('error', error);
            writeFileSync(
              path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`),
              JSON.stringify({ error, itemToUpdate, syncEvent }, getCircularReplacer(), 2)
            );
          }

          continue;
        }

        log(
          'info',
          'UPDATE EVENT',
          {
            eventId: itemToUpdate.eventId,
            locationId: itemToUpdate.locationId
          }
        );
        // console.log( JSON.stringify( _.orderBy( _.flatten( syncEvents.map( v => v.data.timings ) ), [ 'begin', 'end' ] ) ) );
        // console.log( JSON.stringify( _.orderBy( timingsStrings( itemToUpdate.data.timings ), [ 'begin', 'end' ] ) ) );
        // console.log( 'sameTimings', sameTimings );
        // console.log(
        //   _.differenceWith(
        //     _.orderBy( _.flatten( syncEvents.map( v => v.data.timings ) ), [ 'begin', 'end' ] ),
        //     _.orderBy( timingsStrings( itemToUpdate.data.timings ), [ 'begin', 'end' ] ),
        //     _.isEqual
        //   )
        // );

        try {
          if (!simulate) {
            const updatedEvent = await updateEvent(
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
          if (_.get(e, 'response.body.error') === 'event not found') {
            try {
              if (!simulate) {
                // Remove event from nedb and recreate
                await syncDb.events.remove({ _id: syncEvent._id }, {});

                const createdEvent = await createEvent(
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
                  correspondenceId: itemToUpdate.correspondenceId,
                  syncedAt: new Date(),
                  data: createdEvent
                });
              }

              upStats(stats, 'recreatedEvents');
            } catch (e) {
              const error = new VError(e, 'Error on event recreate');

              upStats(stats, 'eventRecreateErrors');

              log('error', error);
              writeFileSync(
                path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`),
                JSON.stringify({ error, itemToUpdate, syncEvent }, getCircularReplacer(), 2)
              );
            }
          } else {
            ignoredDeletes.push(syncEvent.data.uid);

            const error = new VError(e, 'Error on event update');

            upStats(stats, 'eventUpdateErrors');

            log('error', error);
            writeFileSync(
              path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`),
              JSON.stringify({ error, itemToUpdate, syncEvent }, getCircularReplacer(), 2)
            );
          }
        }
      } else {
        // create
        let event = {
          ...itemToUpdate.data,
          timings
        };

        if (typeof methods.event.postMap === 'function') {
          event = await methods.event.postMap(event, formSchema);
        }

        if (!event) {
          upStats(stats, 'ignoredEvents');

          continue;
        }

        log(
          'info',
          'UPDATE EVENT (one more for new timings)',
          {
            eventId: itemToUpdate.eventId,
            locationId: itemToUpdate.locationId
          }
        );

        try {
          if (!simulate) {
            const createdEvent = await createEvent(
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
              correspondenceId: itemToUpdate.correspondenceId,
              syncedAt: new Date(),
              data: createdEvent
            });
          }

          upStats(stats, 'createdEvents');
        } catch (e) {
          const error = new VError(e, 'Error on event update (one more for new timings)');

          upStats(stats, 'eventCreateTimingsErrors');

          log('error', error);
          writeFileSync(
            path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`),
            JSON.stringify({ error, itemToUpdate, syncEvent }, getCircularReplacer(), 2)
          );
        }
      }
    }

    for (let i = chunkedTimings.length; i < syncEvents.length; i++) {
      const syncEvent = syncEvents[i];

      try {
        if (!simulate) {
          await oa.events.delete(agendaUid, syncEvent.data.uid)
            .catch(e => {
              if ( // already removed on OA
                !_.isMatch(e && e.response && e.response, {
                  status: 404,
                  body: {
                    error: 'event not found'
                  }
                })
              ) {
                throw e;
              }
            });
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
        const error = new VError(e, 'Error on event update (one less for removed timings)');

        upStats(stats, 'eventRemoveTimingsErrors');

        log('error', error);
        writeFileSync(
          path.join(directory, 'errors', `${startSyncDate.toISOString()}:${itemToUpdate.correspondenceId}:${i}.json`),
          JSON.stringify({ error, itemToUpdate, syncEvent }, getCircularReplacer(), 2)
        );
      }
    }
  }

  // writeFileSync( 'changes.json', JSON.stringify( changes, null, 2 ) );

  /* PHASE 4: deletes */
  if (skipDeletion) {
    return;
  }

  const eventsToRemove = await syncDb.events.find({
    query: {
      syncedAt: { $lt: startSyncDate },
      'data.uid': {
        $nin: ignoredDeletes
      }
    }
  });

  for (const eventToRemove of eventsToRemove) {
    try {
      if (!simulate) {
        await oa.events.delete(agendaUid, eventToRemove.data.uid)
          .catch(e => {
            if ( // already removed on OA
              !_.isMatch(e && e.response && e.response, {
                status: 404,
                body: {
                  error: 'event not found'
                }
              })
            ) {
              throw e;
            }
          });

        await syncDb.events.remove({ _id: eventToRemove._id }, {});
      }

      log('info', 'REMOVE EVENT', { oaEventUid: eventToRemove.data.uid });

      upStats(stats, 'removedEvents');
    } catch (e) {
      const error = new VError(e, 'Error on event remove');

      upStats(stats, 'eventRemoveErrors');

      log('error', error);
      writeFileSync(
        path.join(directory, 'errors', `${startSyncDate.toISOString()}:${eventToRemove.data.uid}.json`),
        JSON.stringify({ error, eventToRemove }, getCircularReplacer(), 2)
      );

      log('error', new VError({
        cause: e,
        info: eventToRemove
      }, 'Error on event remove'));
    }
  }
}

function timingsStrings(timings) {
  return timings.map(v => ({
    begin: moment(v.begin).toISOString(),
    end: moment(v.end).toISOString()
  }));
}

function reduceStats(stats) {
  const mergedEventsList = stats.mergedSourceEvents ? Object.values(stats.mergedSourceEvents) : [];

  if (!mergedEventsList.length) {
    return;
  }

  stats.mergedSourceEvents = _.sum(mergedEventsList);
  stats.mergedEvents = mergedEventsList.length;
}

async function pushStats(config, stats) {
  if (!config.redis) {
    return;
  }

  const { data: agenda } = await axios.get(`https://openagenda.com/agendas/${config.agenda.uid}`);

  await statsUtil.push(config, {
    agenda,
    stats
  });
}
