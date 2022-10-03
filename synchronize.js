'use strict';

const { writeFileSync, readFileSync, unlinkSync } = require('fs');
const path = require('path');
const Nedb = require('nedb');
const moment = require('moment');
const stringify = require('json-stringify-safe');
const VError = require('@openagenda/verror');
const OaSdk = require('@openagenda/sdk-js');
const { hooks, middleware } = require('@feathersjs/hooks');
const upStats = require('./lib/upStats');
const promisifyStore = require('./utils/promisifyStore');
const SourceError = require('./errors/SourceError');

const listSavedEvents = require('./lib/listSavedEvents');
const dispatchEvent = require('./dispatchEvent');
const createEvent = require('./createEvent');
const updateEvent = require('./updateEvent');
const deleteEvent = require('./deleteEvent');

const filterTimings = require('./hooks/filterTimings');
const throwMissingTimings = require('./hooks/throwMissingTimings');
const transformFlatTimings = require('./hooks/transformFlatTimings');
const addDefaultCountryCode = require('./hooks/addDefaultCountryCode');
const catchInvalidImage = require('./hooks/catchInvalidImage');

module.exports = async function synchronize(params) {
  const {
    methods,
    directory,
    skipDeletion,
    log,
    stats,
    secretKey,
    flatTimingDuration,
    defaultCountryCode = 'FR'
  } = params;

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

  const oa = new OaSdk({ secretKey });

  params.syncDb = syncDb;
  params.oa = oa;

  hooks(methods.event, {
    map: middleware([
      throwMissingTimings(),
      filterTimings(),
      transformFlatTimings(flatTimingDuration),
    ]).params('event', 'formSchema', 'oaLocations').props({ params }),
    postMap: middleware([
      throwMissingTimings(),
      filterTimings(),
      transformFlatTimings(flatTimingDuration),
      catchInvalidImage(),
    ]).params('event', 'formSchema').props({ params })
  });

  hooks(methods.location, {
    get: middleware([
      addDefaultCountryCode(defaultCountryCode)
    ]).params('locationId', 'eventLocation').props({ params })
  });

  function catchError(error, filename) {
    log('error', error);

    writeFileSync(
      path.join(directory, 'errors', filename),
      stringify(error, null, 2)
    );
  }

  const startSyncDate = new Date();
  log('info', `startSyncDate: ${startSyncDate.toJSON()}`);
  stats.startSyncDate = startSyncDate;
  stats.startSyncDateStr = moment(startSyncDate).locale('fr').format('dddd D MMMM YYYY à HH:mm');

  const agendaMap = {}; // oaLocations, formSchema, changes

  const ignoredDeletes = [];

  /* PHASE 1: compare to existent events */
  const filenames = listSavedEvents(directory);

  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];

    log.info(`Dispatch ${filename} (${i + 1}/${filenames.length})`);

    const event = JSON.parse(readFileSync(path.join(directory, 'data', filename), 'utf8'));
    let eventId;

    try {
      eventId = await dispatchEvent(params, {
        agendaMap,
        event,
        catchError,
        startSyncDate,
      });
    } catch (e) {
      const error = new VError({
        cause: e,
        message: 'Error in event map',
        info: {
          eventId,
          event
        }
      });

      if (!(error instanceof SourceError)) {
        upStats(stats, 'eventMapErrors', error);
      }
      catchError(error, `${startSyncDate.toISOString()}:${filename}`);
    } finally {
      unlinkSync(path.join(directory, 'data', filename));
    }
  }

  for (const agendaUid in agendaMap) {
    const { changes, formSchema } = agendaMap;

    /* PHASE 2: creates */
    for (let index = 0; index < changes.create.length; index++) {
      await createEvent(params, {
        agendaUid,
        formSchema,
        list: changes.create,
        index,
        catchError,
        startSyncDate,
      });

      /* PHASE 3: updates */
      for (let index = 0; index < changes.update.length; index++) {
        await updateEvent(params, {
          agendaUid,
          formSchema,
          list: changes.update,
          index,
          catchError,
          startSyncDate,
          ignoredDeletes,
        });
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

  for (let index = 0; index < eventsToRemove.length; index++) {
    await deleteEvent(params, {
      list: eventsToRemove,
      index,
      catchError,
      startSyncDate,
    });
  }
};

// TODO get agenda
