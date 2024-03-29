'use strict';

const _ = require('lodash');

module.exports = {
  _,
  domain: 'https://openagenda.com',
  data2: [
    {
      sectionTitle: 'Toulouse',
      savedEvents: 261,
      startSyncDate: '2022-10-05T08:25:52.513Z',
      startSyncDateStr: 'mercredi 5 octobre 2022 à 10:25',
      agendaErrors: 261,
      stats: [],
    },
  ],
  data: [
    {
      startSyncDateStr: 'jeudi 13 février 2020 à 15:00',
      stats: [
        {
          agenda: {
            uid: 7664114,
            title: 'Launaguet sync test',
            description: 'Launaguet sync test',
            slug: 'launaguet-sync-test',
            url: null,
            official: 0,
            image: null,
          },
          savedEvents: 14000,
          upToDateEvents: 14000,
        },
      ],
    },
    {
      stats: [
        {
          startSyncDateStr: 'jeudi 13 février 2020 à 16:00',
          agenda: {
            uid: 12345678,
            title: 'Saint Jean',
            description: 'Saint Jean',
            slug: 'saint-jean-test',
            url: null,
            official: 0,
            image: null,
          },
          savedEvents: 48,
          splitSourceLocations: 4,
          splittedSourceLocations: 8,
          eventsWithoutLocation: 4,
          mergedSourceEvents: 20,
          mergedEvents: 2,
          ignoredEvents: 8,
          invalidImages: 3,
          upToDateEvents: 22,
        },
      ],
    },
    {
      startSyncDateStr: 'jeudi 13 février 2020 à 17:00',
      stats: [
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
          eventListError: { message: 'Broken json' }
        }
      ]
    },
    {
      startSyncDateStr: 'jeudi 13 février 2020 à 18:00',
      stats: [
        {
          agenda: {
            uid: 12345678,
            title: 'Splitted truc',
            description: 'Splitted truc',
            slug: 'splitted-truc-test',
            url: null,
            official: 0,
            image: null
          },
          savedEvents: 45,
          splitSourceEvents: 4,
          splittedSourceEvents: 10,
          locationErrors: 12
        }
      ]
    },
    {
      startSyncDateStr: 'jeudi 13 février 2020 à 18:00',
      stats: [
        {
          agenda: {
            uid: 12345678,
            title: 'Une source vide',
            description: 'Une source vide',
            slug: 'source-vide',
            url: null,
            official: 0,
            image: null
          },
        }
      ]
    },
    {
      startSyncDate: '2020-02-27T16:26:05.607Z',
      startSyncDateStr: 'jeudi 27 février 2020 à 17:26',
      stats: [
        {
          agenda: {
            uid: 12345678,
            title: 'Une source avec des horaires manquants',
            description: 'Une source avec des horaires manquants',
            slug: 'source-missing-timings',
            url: null,
            official: 0,
            image: null
          },
          sourceErrors: {
            missingTimings: [
              13803,
              13546,
              12907,
              12367,
              12361,
              12345,
              11692,
              11649,
              11647,
              10275,
              10088,
              9920,
              9917,
              9904,
              9894,
              9887,
              9880,
              9828,
              9752,
              9749,
              9379,
              9323,
              9321,
              9303,
              9276
            ]
          },
          savedEvents: 213,
          invalidImages: 13,
          eventMapErrors: 28,
          updatedEvents: 185,
          oaRequestErrors: 3
        }
      ]
    },
    {
      startSyncDate: '2021-12-02T10:53:12.313Z',
      startSyncDateStr: 'jeudi 2 décembre 2021 à 11:53',
      stats: [
        {
          agenda: {
            uid: 12345678,
            title: 'Des erreurs de validation',
            description: 'Une description.',
            slug: 'validation-issues',
            url: null,
            official: 0,
            image: null
          },
          savedEvents: 24,
          invalidImages: 2,
          upToDateEvents: 23,
          sourceErrors: {
            validationError: ['33987.Quai-des-arts-Centre-darts-visuels-Espace-dexposition']
          },
          eventUpdateErrors: 1
        }
      ]
    }
  ],
};
