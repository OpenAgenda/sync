'use strict';

const _ = require('lodash');
const moment = require('moment');
const VError = require('@openagenda/verror');
const upStats = require('./lib/upStats');
const getFormSchema = require('./lib/getFormSchema');
const listOaLocations = require('./lib/listOaLocations');
const SourceError = require('./errors/SourceError');
const getOrCreateLocation = require('./getOrCreateLocation');

function addEvent(params, list, {
  correspondenceId,
  data,
  eventId,
  locationId,
  event
}) {
  const { stats } = params;
  const item = list.find(v => v.correspondenceId === correspondenceId);

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

    if (!stats.mergedSourceEvents) {
      stats.mergedSourceEvents = {};
    }

    stats.mergedSourceEvents[correspondenceId] = (stats.mergedSourceEvents[correspondenceId] || 1) + 1;
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

module.exports = async function dispatchEvent(params, {
  agendaMap,
  event,
  catchError,
  startSyncDate,
}) {
  const { methods, publicKey, oa, syncDb, log, stats } = params;

  const agendaUid = await methods.event.getAgendaUid(event);

  if (!agendaUid) {
    // TODO error
    console.log('This event don\'t have agenda for dispatch', event);
    return;
  }

  if (!agendaMap[agendaUid]) {
    agendaMap[agendaUid].formSchema = await getFormSchema(agendaUid, publicKey);
    agendaMap[agendaUid].oaLocations = await listOaLocations(oa, agendaUid, log);
    agendaMap[agendaUid].changes = {
      create: [],
      update: [],
    };
  }

  const { formSchema, oaLocations, changes } = agendaMap[agendaUid];

  const eventId = methods.event.getId(event);
  const mappedEvent = await methods.event.map(event, formSchema, oaLocations);

  if (!mappedEvent) {
    upStats(stats, 'ignoredEvents');
    return;
  }

  const eventLocations = mappedEvent.locations;
  delete mappedEvent.locations;

  if (eventLocations.length === 0) {
    throw new SourceError('Missing location');
  }

  if (eventLocations.length > 1) {
    upStats(stats, 'splitSourceLocations');
    upStats(stats, 'splittedSourceLocations', eventLocations.length);
  }

  for (const eventLocation of eventLocations) {
    let location;
    let locationId;

    try {
      ({
        location,
        locationId
      } = await getOrCreateLocation(params, {
        event,
        eventId,
        oaLocations,
        eventLocation
      }));
    } catch (e) {
      const error = new VError({
        cause: e,
        message: 'Error in location phase',
        info: {
          eventId,
          eventLocation,
          mappedEvent
        }
      });

      upStats(stats, 'locationErrors', error);
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
      addEvent(params, changes.update, {
        correspondenceId,
        data,
        eventId,
        locationId,
        event
      });
    } else {
      addEvent(params, changes.create, {
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
