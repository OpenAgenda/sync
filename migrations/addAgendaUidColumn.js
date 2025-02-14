'use strict';

module.exports = async function addAgendaUidColumn({ syncDb, log }) {
  const events = await syncDb.events.find({ query: { agendaUid: { $exists: false } } });

  for (const event of events) {
    await syncDb.events.update(
      { _id: event._id },
      { $set: { agendaUid: event.data.agendaUid } },
      {},
    );
  }

  log.debug(`migration addAgendaUidColumn: ${events.length} events updated`);
};
