'use strict';

const { writeFileSync, unlinkSync } = require('fs');
const path = require('path');
const { inspect } = require('util');
const Nedb = require('nedb');
const moment = require('moment');
const stringify = require('json-stringify-safe');
const sanitizeFilename = require('sanitize-filename');
const { OaSdk } = require('@openagenda/sdk-js');
const { hooks, middleware, HOOKS } = require('@feathersjs/hooks');
const promisifyStore = require('./utils/promisifyStore');
const migrate = require('./migrations');
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
const downloadSourceEvents = require('./downloadSourceEvents');

module.exports = async function synchronize(params) {
  const {
    methods,
    directory,
    downloadOnly,
    skipDeletion,
    simulate,
    log,
    secretKey,
    flatTimingDuration,
    defaultCountryCode = 'FR'
  } = params;

  const stats = {};
  const agendaMap = {}; // agenda, oaLocations, changes
  const ignoredDeletes = [];

  const startSyncDate = new Date();
  log('info', `startSyncDate: ${startSyncDate.toJSON()}`);
  stats.startSyncDate = startSyncDate;
  stats.startSyncDateStr = moment(startSyncDate).locale('fr').format('dddd D MMMM YYYY à HH:mm');
  stats.agendas = {};

  const syncDb = {
    events: promisifyStore(new Nedb({
      filename: path.join(directory, 'db', 'events.nedb'),
      timestampData: true,
      autoload: true,
    })),
    locations: promisifyStore(new Nedb({
      filename: path.join(directory, 'db', 'locations.nedb'),
      timestampData: true,
      autoload: true,
    })),
    migrations: promisifyStore(new Nedb({
      filename: path.join(directory, 'db', 'migrations.nedb'),
      // timestampData: true,
      autoload: true,
    })),
  };

  await migrate({ syncDb, log });

  const oa = new OaSdk({ secretKey });

  function catchError(error, filename) {
    log('error', error);

    writeFileSync(
      path.join(directory, 'errors', sanitizeFilename(filename)),
      stringify(error, null, 2)
    );
  }

  const context = {
    ...params,
    syncDb,
    oa,
    stats,
    agendaMap,
    ignoredDeletes,
    catchError,
  };

  // Not already hooked
  if (!methods.event.map[HOOKS]) {
    hooks(methods.event, {
      map: middleware([
        throwMissingTimings(),
        filterTimings(),
        transformFlatTimings(flatTimingDuration),
      ]).params('event', 'formSchema', 'oaLocations'),
      postMap: middleware([
        throwMissingTimings(),
        filterTimings(),
        transformFlatTimings(flatTimingDuration),
        catchInvalidImage(),
      ]).params('event', 'formSchema', 'options'),
    });

    hooks(methods.location, {
      get: middleware([
        addDefaultCountryCode(defaultCountryCode)
      ]).params('locationId', 'eventLocation'),
    });
  }

  /* PHASE 1: download events from sources */
  if (!simulate) {
    log('info', 'Start saving');

    try {
      await downloadSourceEvents(context);
    } catch (e) {
      if (e && (!e.response || e.response.status !== 416)) { // OutOfRange
        log('error', `Cannot list events: ${inspect(e)}`);

        stats.eventListError = { message: e.message, status: e.response && e.response.status };

        return { stats, agendaMap };
      }
    }
  }

  if (downloadOnly) {
    return { stats, agendaMap };
  }

  /* PHASE 2: compare to existent events */
  const filenames = listSavedEvents(directory);

  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];

    log.info(`Dispatch ${filename} (${i + 1}/${filenames.length})`);

    await dispatchEvent(context, filename);

    unlinkSync(path.join(directory, 'data', filename));
  }

  for (let agendaUid in agendaMap) {
    agendaUid = parseInt(agendaUid, 10);
    const { agenda, changes } = agendaMap[agendaUid];
    const formSchema = agenda.schema.fields;

    /* PHASE 3: creates */
    for (let index = 0; index < changes.create.length; index++) {
      await createEvent(context, {
        agendaUid,
        formSchema,
        list: changes.create,
        index,
      });
    }

    /* PHASE 4: updates */
    for (let index = 0; index < changes.update.length; index++) {
      await updateEvent(context, {
        agendaUid,
        formSchema,
        list: changes.update,
        index,
      });
    }
  }

  // writeFileSync( 'changes.json', JSON.stringify( changes, null, 2 ) );

  /* PHASE 5: deletes */
  if (skipDeletion) {
    return { stats, agendaMap };
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
    await deleteEvent(context, {
      list: eventsToRemove,
      index,
    });
  }

  return { stats, agendaMap };
};
