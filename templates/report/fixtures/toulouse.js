'use strict';

const _ = require('lodash');

module.exports = {
  _,
  domain: 'https://openagenda.com',
  data: [
    {
      agenda: {
        uid: 7664114,
        title: 'Launaguet sync test',
        description: 'Launaguet sync test',
        slug: 'launaguet-sync-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        startSyncDateStr: 'jeudi 13 février 2020 à 15:00',
        savedEvents: 14,
        upToDateEvents: 14
      }
    },
    {
      agenda: {
        uid: 12345678,
        title: 'Saint Jean',
        description: 'Saint Jean',
        slug: 'saint-jean-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        startSyncDateStr: 'jeudi 13 février 2020 à 16:00',
        savedEvents: 48,
        mergedSourceEvents: 20,
        mergedEvents: 2,
        invalidImages: 3
      }
    },
    {
      agenda: {
        uid: 12345678,
        title: 'Saint Orens',
        description: 'Saint Orens',
        slug: 'saint-orens-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        startSyncDateStr: 'jeudi 13 février 2020 à 17:00',
        eventListError: { message: 'Broken json' }
      }
    },
    {
      agenda: {
        uid: 12345678,
        title: 'Splited truc',
        description: 'Splited truc',
        slug: 'splited-truc-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        startSyncDateStr: 'jeudi 13 février 2020 à 18:00',
        splitSourceEvents: 4,
        splitedSourceEvents: 10
      }
    },
  ]
};