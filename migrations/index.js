'use strict';

const addAgendaUidColumn = require('./addAgendaUidColumn');

module.exports = async function migrate({ syncDb, log }) {
  async function runMigration(name, fn) {
    const migrated = await syncDb.migrations.findOne({ query: { name } });
    if (migrated) {
      log.debug(`migration ${name} already executed`);
      return;
    }
    await fn({ syncDb, log });
    await syncDb.migrations.insert({ name });
    log.info(`migration ${name} executed`);
  }

  await runMigration('addAgendaUidColumn', addAgendaUidColumn);
};
