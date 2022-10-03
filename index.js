'use strict';

const { readdirSync } = require('fs');
const { inspect } = require('util');
const path = require('path');
const _ = require('lodash');
const moment = require('moment');
const mkdirp = require('mkdirp');
const downloadSourceEvents = require('./downloadSourceEvents');
const synchronize = require('./synchronize');
const statsUtil = require('./lib/stats');

// Defauts
const defaultGetLocation = (locationId, eventLocation) => eventLocation;
const defaultGetEventUpdatedDate = () => new Date();
const defaultPostMapEvent = event => event;

/*
* créer une méthode `event.list(offset, limit)`
* créer une méthode `event.map(event, formSchema, oaLocations)`           (transform from foreign event to oa event)
*   - chaque event doit contenir un tableau `locations`                   (useful for location.{get/map})
* paramétrer une interface `event.getId(event)`                           (for create correpondenceId)
* paramétrer une interface `event.getUpdatedDate(event)`                  (for keep the update date up-to-date)
* paramétrer une interface `location.getId(location, event)`              (for getLocation and create correpondenceId)
* paramétrer une interface `location.find(oaLocations, location)`         (for search in oa locations)
* créer une méthode `location.get(locationId, eventLocation)`             (get a foreign location)
* créer une méthode `location.map(location, eventLocation)`               (transform from foreign location to oa location)
* */

/*
* METHODS
*
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

async function statsWork(params) {
  const { stats } = params;

  const mergedEventsList = stats.mergedSourceEvents ? Object.values(stats.mergedSourceEvents) : [];

  // TODO works without
  /* if (!mergedEventsList.length) {
    return;
  } */

  stats.mergedSourceEvents = _.sum(mergedEventsList);
  stats.mergedEvents = mergedEventsList.length;

  await statsUtil.push(params);
  await statsUtil.sendReport(params);

  return stats;
}

module.exports = async function syncTask(options) {
  const params = _.merge({
    methods: {
      event: {
        getEventUpdatedDate: defaultGetEventUpdatedDate,
        postMap: defaultPostMapEvent
      },
      location: {
        get: defaultGetLocation
      },
    },
    stats: {}
  }, options);

  const {
    directory,
    log,
    downloadOnly,
    simulate,
    stats,
  } = params;

  await mkdirp(path.join(directory, 'data'));
  await mkdirp(path.join(directory, 'errors'));
  await mkdirp(path.join(directory, 'db'));

  try {
    if (simulate) {
      await synchronize(params);
      return stats;
    }

    // Before all we finish the last synchronisation
    if (!downloadOnly && readdirSync(path.join(directory, 'data')).length) {
      await synchronize({ ...params, skipDeletion: true });
    }

    log('info', 'Start saving');

    try {
      await downloadSourceEvents(params);
    } catch (e) {
      if (e && (!e.response || e.response.status !== 416)) { // OutOfRange
        log('error', `Cannot list events: ${inspect(e)}`);

        stats.startSyncDateStr = moment().locale('fr').format('dddd D MMMM YYYY à HH:mm');
        stats.eventListError = { message: e.message, status: e.response && e.response.status };

        return statsWork(params);
      }
    }

    if (downloadOnly) {
      return stats;
    }

    await synchronize(params);
  } catch (e) {
    // script error
    log('error', e.response || e);
  }

  return statsWork(params);
};
