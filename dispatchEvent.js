'use strict';

const _ = require('lodash');
const moment = require('moment');
const VError = require('@openagenda/verror');
const upStats = require('./lib/upStats');
const getAgenda = require('./lib/getAgenda');
const listOaLocations = require('./lib/listOaLocations');
const SourceError = require('./errors/SourceError');
const getOrCreateLocation = require('./getOrCreateLocation');
const { readFileSync } = require('fs');
const path = require('path');

function addEvent(context, list, {
  agendaUid,
  correspondenceId,
  data,
  eventId,
  locationId,
  event
}) {
  const { stats } = context;
  const item = list.find(v => v.correspondenceId === correspondenceId);

  const agendaStats = stats.agendas[agendaUid];

  if (item) {
    // merge timings and update the event(s)
    item.rawEvents.push(event);

    item.data = {
      ...data,
      timings: _.uniqWith(
        _.concat(item.data.timings, data.timings)
          .map(v => ({
            begin: moment(v.begin).toISOString(),
            end: moment(v.end).toISOString()
          })),
        _.isEqual
      )
    };

    if (!agendaStats.mergedSourceEvents) {
      agendaStats.mergedSourceEvents = {};
    }

    agendaStats.mergedSourceEvents[correspondenceId] = (agendaStats.mergedSourceEvents[correspondenceId] || 1) + 1;
  } else {
    list.push({
      correspondenceId,
      eventId,
      locationId,
      data,
      rawEvents: [event]
    });
  }
}

module.exports = async function dispatchEvent(context, filename) {
  const {
    methods,
    getAgendaUid,
    directory,
    publicKey,
    oa,
    syncDb,
    log,
    stats,
    agendaMap,
    catchError,
  } = context;
  const { startSyncDate } = stats;

  const event = JSON.parse(readFileSync(path.join(directory, 'data', filename), 'utf8'));

  let agendaUid;

  try {
    agendaUid = await getAgendaUid(event);

    if (!agendaUid) {
      throw new VError('This event don\'t have agenda for dispatch');
    }

    if (!agendaMap[agendaUid]) {
      agendaMap[agendaUid] = {
        agenda: await getAgenda(agendaUid, publicKey)
          .catch(err => {
            throw new VError(err, `Can\'t get agenda ${agendaUid}`);
          }),
        oaLocations: await listOaLocations(oa, agendaUid, log)
          .catch(err => {
            throw new VError(err, `Can\'t list locations of the agenda ${agendaUid}`);
          }),
        changes: {
          create: [],
          update: [],
        },
      };
    }
  } catch (e) {
    const error = new VError({
      name: 'AgendaInfoError',
      cause: e,
      info: {
        event
      }
    }, 'Event can\'t be dispatched');

    upStats(stats, 'agendaErrors');
    catchError(error, `${startSyncDate.toISOString()}:${filename}`);

    return;
  }

  const { agenda, oaLocations, changes } = agendaMap[agendaUid];
  const formSchema = agenda.schema.fields;

  if (!stats.agendas[agendaUid]) {
    stats.agendas[agendaUid] = {};
  }
  const agendaStats = stats.agendas[agendaUid];

  upStats(agendaStats, 'savedEvents');

  let eventId;
  let mappedEvent;
  let eventLocations;

  try {
    eventId = methods.event.getId(event);
    const mapContext = methods.event.map.createContext(context);
    ({ result: mappedEvent } = await methods.event.map(event, formSchema, oaLocations, mapContext));

    if (!mappedEvent) {
      upStats(agendaStats, 'ignoredEvents');
      return;
    }

    eventLocations = mappedEvent.locations;
    delete mappedEvent.locations;

    if (eventLocations.length === 0) {
      throw new SourceError('Missing location');
    }
  } catch (e) {
    const error = new VError({
      cause: e,
      info: {
        agendaUid,
        eventId,
        event
      },
    }, 'Error in event map');

    // if (!(error instanceof SourceError)) {
    upStats(agendaStats, 'eventMapErrors', error);
    // }
    catchError(error, `${startSyncDate.toISOString()}:${filename}`);

    return;
  }

  if (eventLocations.length > 1) {
    upStats(agendaStats, 'splitSourceLocations');
    upStats(agendaStats, 'splittedSourceLocations', eventLocations.length);
  }

  for (const eventLocation of eventLocations) {
    let location;
    let locationId;

    try {
      ({
        location,
        locationId
      } = await getOrCreateLocation(context, {
        agendaUid,
        event,
        eventId,
        oaLocations,
        eventLocation
      }));
    } catch (e) {
      const error = new VError({
        cause: e,
        info: {
          eventId,
          eventLocation,
          mappedEvent
        }
      }, 'Error in location phase');

      upStats(agendaStats, 'locationErrors', error);
      catchError(error, `${startSyncDate.toISOString()}:${eventId}.${locationId}.json`);

      continue;
    }

    const data = {
      ...mappedEvent,
      locationUid: location.uid
    };

    const correspondenceId = `${eventId}.${locationId}`;

    const syncEvent = await syncDb.events.findOne({ query: { agendaUid, correspondenceId } });

    if (syncEvent) {
      addEvent(context, changes.update, {
        agendaUid,
        correspondenceId,
        data,
        eventId,
        locationId,
        event
      });
    } else {
      addEvent(context, changes.create, {
        agendaUid,
        correspondenceId,
        data,
        eventId,
        locationId,
        event
      });
    }
  }

  return eventId;
};
