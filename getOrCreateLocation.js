'use strict';

const potentialOaError = require('./utils/potentialOaError');
const upStats = require('./lib/upStats');

module.exports = async function getOrCreateLocation(params, {
  event,
  eventId,
  oaLocations,
  eventLocation,
}) {
  const {
    agendaUid,
    methods,
    syncDb,
    oa,
    simulate,
    stats,
    log,
  } = params;

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
      const mappedLocation = await methods.location.map(
        await methods.location.get(locationId, eventLocation),
        eventLocation
      );
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

  return {
    location,
    locationId,
  };
};
