'use strict';

const { writeFileSync } = require('fs');
const path = require('path');
const upStats = require('./lib/upStats');

module.exports = async function downloadSourceEvents(params) {
  const { methods, directory, log, stats } = params;

  const limit = 20;
  let events;
  let offset = 0;

  while ((events = await methods.event.list(offset, limit)) && events.length) {
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
};
