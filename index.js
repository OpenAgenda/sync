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
const promisifyStore = require('./utils/promisifyStore');
const isURL200 = require('./utils/isURL200');
const statsUtil = require('./stats');
// Oa
const getFormSchema = require('./getFormSchema');
const listOaLocations = require('./listOaLocations');
const listSavedEvents = require('./listSavedEvents');

function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
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

        stats.sourceError = { message: e.message, status: e.response && e.response.status };

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
    log('error', e.response || e);
  }

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

  const startSyncDate = new Date();
  log('info', `startSyncDate: ${startSyncDate.toJSON()}`);

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

    log.info(`Dispatch ${filename} (${i+1}/${filenames.length})`);

    const event = JSON.parse(readFileSync(path.join(directory, 'data', filename), 'utf8'));

    try {
      const eventId = methods.event.getId(event);
      const mappedEvent = await methods.event.map(event, formSchema, oaLocations);

      if (!mappedEvent) {
        if (!simulate) {
          unlinkSync(path.join(directory, 'data', filename));
        }

        continue;
      }

      if (
        noBailOnInvalidImage
        && mappedEvent.image && !(await isURL200(mappedEvent.image.url))
      ) {
        upStats(stats, 'invalidImage');
        mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      }

      for (const eventLocation of mappedEvent.locations) {
        let syncEvent = null;

        try {
          let location;
          const locationId = methods.location.getId(eventLocation, event);
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

          delete mappedEvent.locations;
          mappedEvent.locationUid = location.uid;

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
                ...mappedEvent,
                timings: _.uniqWith(
                  _.concat(itemToUpdate.data.timings, mappedEvent.timings)
                    .map(v => ({
                      begin: moment(v.begin).toISOString(),
                      end: moment(v.end).toISOString()
                    })),
                  _.isEqual
                )
              };

              upStats(stats, 'mergedSourceEvents');
            } else {
              changes.update.push({
                correspondenceId,
                eventId,
                locationId,
                data: { ...mappedEvent },
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
                ...mappedEvent,
                timings: _.uniqWith(
                  _.concat(itemToCreate.data.timings, mappedEvent.timings)
                    .map(v => ({
                      begin: moment(v.begin).toISOString(),
                      end: moment(v.end).toISOString()
                    })),
                  _.isEqual
                )
              };

              upStats(stats, 'mergedSourceEvents');
            } else {
              changes.create.push({
                correspondenceId,
                eventId,
                locationId,
                data: { ...mappedEvent },
                rawEvents: [event]
              });
            }
          }
        } catch (e) {
          if (
            _.isMatch(e && e.response && e.response.body, {
              error: 'invalid_request',
              error_description: 'latitude: Latitude is required, longitude: Longitude is required'
            })
          ) {
            log('warn', 'Address not understood, could not geocode', {
              eventId,
              eventLocation,
              mappedEvent
            });
          } else {
            throw new VError({
              cause: e,
              info: {
                eventId,
                eventLocation,
                mappedEvent
              }
            }, 'Error on syncing');
          }
        }
      }
    } catch (error) {
      log('error', error);
      writeFileSync(
        path.join(directory, 'errors', `${startSyncDate.toISOString()}:${filename}`),
        JSON.stringify({ error, event }, getCircularReplacer(), 2)
      );
    } finally {
      unlinkSync(path.join(directory, 'data', filename));
    }
  }

  /* PHASE 2: creates */
  for (const itemToCreate of changes.create) {
    const chunkedTimings = _.chunk(itemToCreate.data.timings, 800);

    for (const timings of chunkedTimings) {
      let event = { ...itemToCreate.data, timings };

      if (typeof methods.event.postMap === 'function') {
        event = await methods.event.postMap(event, formSchema);
      }

      if (!event) {
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
        log('error', new VError({
          cause: e,
          info: itemToCreate
        }, 'Error on event create'));
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

        if (typeof methods.event.postMap === 'function') {
          event = await methods.event.postMap(event, formSchema);
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
              await oa.events.delete(agendaUid, syncEvent.data.uid);

              await syncDb.events.remove({ _id: syncEvent._id }, {});
            }
          } catch (e) {
            log(
              'error',
              new VError({
                cause: e,
                info: syncEvent
              }, 'Error on event removing')
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
              log('error', new VError({
                cause: e,
                info: itemToUpdate
              }, 'Error on event update'));
            }
          } else {
            ignoredDeletes.push(syncEvent.data.uid);

            log('error', new VError({
              cause: e,
              info: itemToUpdate
            }, 'Error on event update'));
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
          log('error', new VError({
            cause: e,
            info: itemToUpdate
          }, 'Error on event update (one more for new timings)'));
        }
      }
    }

    for (let i = chunkedTimings.length; i < syncEvents.length; i++) {
      const syncEvent = syncEvents[i];

      if (!simulate) {
        await oa.events.delete(agendaUid, syncEvent.data.uid);
      }

      log(
        'info',
        'Event with timings that exceed deleted',
        {
          eventId: itemToUpdate.eventId,
          locationId: itemToUpdate.locationId
        }
      );
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
        await oa.events.delete(agendaUid, eventToRemove.data.uid);

        await syncDb.events.remove({ _id: eventToRemove._id }, {});
      }

      log('info', 'REMOVE EVENT', { oaEventUid: eventToRemove.data.uid });

      upStats(stats, 'removedEvents');
    } catch (e) {
      log('error', new VError({
        cause: e,
        info: eventToRemove
      }, 'Error on event remove'));
    }
  }
}

function upStats(stats, key, increment = 1) {
  if (stats) {
    _.set(stats, key, _.get(stats, key, 0) + increment);
  }
}

async function createEvent(
  mappedEvent,
  {
    oa,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    stats
  }
) {
  let createdEvent;

  try {
    try {
      ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
    } catch (e) {
      // Retry if it's a duplicate slug error
      if (_.isMatch(_.get(e, 'response.body.errors[0]', null), {
        field: 'slug',
        code: 'duplicate'
      })) {
        mappedEvent.slug += '_' + _.random(Math.pow(10, 6));
        ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
      } else {
        throw e;
      }
    }
  } catch (e2) {
    if (noBailOnInvalidImage && _.get(e2, 'response.body.errors[0].step') === 'image') {
      upStats(stats, 'invalidImages');
      mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      ({ event: createdEvent } = await oa.events.create(agendaUid, mappedEvent));
    } else {
      throw e2;
    }
  }

  return createdEvent;
}

async function updateEvent(
  oaEventUid,
  mappedEvent,
  {
    oa,
    agendaUid,
    noBailOnInvalidImage,
    defaultImageUrl,
    stats
  }
) {
  let updatedEvent;

  try {
    ({ event: updatedEvent } = await oa.events.update(agendaUid, oaEventUid, mappedEvent));
  } catch (e) {
    if (noBailOnInvalidImage && _.get(e, 'response.body.errors[0].step') === 'image') {
      upStats(stats, 'invalidImages');
      mappedEvent.image = defaultImageUrl ? { url: defaultImageUrl } : null;
      ({ event: updatedEvent } = await oa.events.update(agendaUid, oaEventUid, mappedEvent));
    } else {
      throw e;
    }
  }

  return updatedEvent;
}

function timingsStrings(timings) {
  return timings.map(v => ({
    begin: moment(v.begin).toISOString(),
    end: moment(v.end).toISOString()
  }));
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
