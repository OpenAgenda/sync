'use strict';

const fs = require('fs/promises');
const path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
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

function transformStats(params, stats, agendaMap) {
  const { reportSectionTitle } = params;

  const mailData = {
    sectionTitle: reportSectionTitle,
    savedEvents: stats.savedEvents,
    startSyncDate: stats.startSyncDate,
    startSyncDateStr: stats.startSyncDateStr,
    agendaErrors: stats.agendaErrors,
    stats: [],
  };

  for (const agendaUid in stats.agendas) {
    const agendaStats = stats.agendas[agendaUid];

    const mergedEventsList = agendaStats.mergedSourceEvents ? Object.values(agendaStats.mergedSourceEvents) : [];

    agendaStats.mergedSourceEvents = _.sum(mergedEventsList);
    agendaStats.mergedEvents = mergedEventsList.length;

    const { agenda } = agendaMap[agendaUid];

    mailData.stats.push({
      ...agendaStats,
      agenda: {
        uid: agenda.uid,
        title: agenda.title,
        slug: agenda.slug,
      }
    });
  }

  return mailData;
}

async function sendReport(params, stats) {
  // add to redis if needed
  await statsUtil.push(params, stats);
  // send if needed
  await statsUtil.sendReport(params, stats);
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
    }
  }, options);

  const { directory, log } = params;

  await fs.rm(path.join(directory, 'data'), { recursive: true });

  await mkdirp(path.join(directory, 'data'));
  await mkdirp(path.join(directory, 'errors'));
  await mkdirp(path.join(directory, 'db'));

  try {
    const { stats, agendaMap } = await synchronize(params);
    const completeStats = transformStats(params, stats, agendaMap);

    await sendReport(params, completeStats);

    return completeStats;
  } catch (e) {
    // script error
    log('error', e.response || e);
  }
};
