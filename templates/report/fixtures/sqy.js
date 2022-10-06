'use strict';

const _ = require('lodash');

module.exports = {
  _,
  domain: 'https://openagenda.com',
  data: [
    {
      sectionTitle: 'SQY - agenda errors',
      savedEvents: 261,
      startSyncDate: '2022-10-05T08:25:52.513Z',
      startSyncDateStr: 'mercredi 5 octobre 2022 à 10:25',
      agendaErrors: 261,
      stats: [],
    },
    {
      sectionTitle: 'SQY - event map errors',
      savedEvents: 261,
      startSyncDate: '2022-10-05T08:35:58.421Z',
      startSyncDateStr: 'mercredi 5 octobre 2022 à 10:35',
      stats: [
        {
          agenda: {
            uid: 72022117,
            title: 'test',
            slug: 'test'
          },
          savedEvents: 261,
          eventMapErrors: 261,
          mergedSourceEvents: 0,
          mergedEvents: 0,
        }
      ],
    },
  ],
};
