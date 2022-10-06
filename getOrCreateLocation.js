'use strict';

const potentialOaError = require('./utils/potentialOaError');
const upStats = require('./lib/upStats');

module.exports = async function getOrCreateLocation(context, {
  agendaUid,
  event,
  eventId,
  oaLocations,
  eventLocation,
}) {
  const {
    methods,
    syncDb,
    oa,
    simulate,
    stats,
    log,
  } = context;

  const agendaStats = stats.agendas[agendaUid];

  let location;

  let locationId = methods.location.getId(eventLocation, event);
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
      const getContext = methods.event.map.createContext(context);
      const { result: sLocation } = await methods.location.get(locationId, eventLocation, getContext);

      const mappedLocation = await methods.location.map(sLocation, eventLocation);
      location = mappedLocation;

      if (!simulate) {
        location = await potentialOaError(oa.locations.create(agendaUid, mappedLocation));

        await syncDb.locations.insert({
          correspondenceId: locationId,
          syncedAt: new Date(),
          data: location
        });
      }

      log(
        'info',
        'LOCATION NOT FOUND => created',
        { agendaUid, eventId, locationId, location }
      );
      upStats(agendaStats, 'createdLocations');
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

  return {
    location,
    locationId,
  };
};
